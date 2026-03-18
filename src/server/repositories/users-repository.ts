import { adminAuth, adminDb } from "@/server/firebase/admin";
import { mapLegacyUser, dedupeUsersByEmail } from "@/domain/users/mapper";
import { parseInviteFormData, parseUserUpdateFormData } from "@/domain/users/schema";
import { buildInviteDocId } from "@/lib/utils";
import { appEnv } from "@/lib/env";
import { randomInviteToken, serverTimestamp } from "@/server/repositories/helpers";
import { logActivity } from "@/server/repositories/activity-repository";

const usersCollection = () => adminDb().collection("users");

export async function listUsers() {
  const snapshot = await usersCollection().get();
  const users = dedupeUsersByEmail(snapshot.docs.map((doc) => mapLegacyUser(doc.id, doc.data())));
  return users.sort((left, right) => Date.parse(right.updatedAt || right.invitedAt || "1970-01-01") - Date.parse(left.updatedAt || left.invitedAt || "1970-01-01"));
}

export async function getUserById(id: string) {
  const snapshot = await usersCollection().doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapLegacyUser(snapshot.id, snapshot.data() ?? {});
}

async function findUserDocsByEmail(email: string) {
  const snapshot = await usersCollection()
    .where("email", "==", email)
    .limit(10)
    .get();

  return snapshot.docs;
}

function pickInviteRecord(docs: Awaited<ReturnType<typeof findUserDocsByEmail>>) {
  return (
    docs.find((doc) => {
      const data = doc.data() ?? {};
      return data.removed !== true && !data.authUid && data.status === "invited";
    }) ?? null
  );
}

export async function createOrRefreshInvite(formData: FormData, invitedBy: string) {
  const input = parseInviteFormData(formData);
  const email = input.email.trim().toLowerCase();
  const existingDocs = await findUserDocsByEmail(email);
  const activeDoc = existingDocs.find((doc) => {
    const data = doc.data() ?? {};
    return data.removed !== true && (data.authUid || data.status === "active");
  });

  if (activeDoc) {
    throw new Error("That user is already active.");
  }

  const existingInvite = pickInviteRecord(existingDocs);
  const docRef = existingInvite?.ref ?? usersCollection().doc();
  const existing = existingInvite?.data() ?? {};

  const token = randomInviteToken();
  const inviteLink = `${appEnv.publicAppUrl}/invite?email=${encodeURIComponent(email)}&invite=${token}`;

  await docRef.set(
    {
      ...existing,
      email,
      name: existing.name ?? "",
      role: input.role,
      phone: existing.phone ?? "",
      invitedBy,
      invitedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: "invited",
      removed: false,
      inviteToken: token,
      inviteLink,
    },
    { merge: true },
  );

  await logActivity({
    action: `Invited user: ${email}`,
    doneBy: invitedBy,
    doneByEmail: invitedBy,
  });

  return inviteLink;
}

export async function updateUser(formData: FormData) {
  const input = parseUserUpdateFormData(formData);
  await usersCollection().doc(input.id).set(
    {
      name: input.name,
      role: input.role,
      phone: input.phone,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeUser(id: string, actorEmail: string) {
  await usersCollection().doc(id).set(
    {
      removed: true,
      removedAt: serverTimestamp(),
      removedBy: actorEmail,
    },
    { merge: true },
  );
}

export async function resolveInviteRecord(email: string, token: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const deterministicRef = usersCollection().doc(buildInviteDocId(normalizedEmail));
  const deterministic = await deterministicRef.get();
  if (deterministic.exists) {
    const data = deterministic.data() ?? {};
    if ((data.email || "").trim().toLowerCase() === normalizedEmail && data.inviteToken === token && !data.removed) {
      return { id: deterministic.id, ref: deterministicRef, raw: data };
    }
  }

  const querySnapshot = await usersCollection()
    .where("email", "==", normalizedEmail)
    .limit(5)
    .get();

  const fallback = querySnapshot.docs.find((doc) => {
    const data = doc.data() ?? {};
    return data.inviteToken === token && !data.removed;
  });

  if (!fallback) {
    return null;
  }

  return { id: fallback.id, ref: fallback.ref, raw: fallback.data() ?? {} };
}

export async function acceptInvite(input: {
  email: string;
  token: string;
  name: string;
  password: string;
}) {
  const invite = await resolveInviteRecord(input.email, input.token);
  if (!invite || invite.raw.status !== "invited") {
    throw new Error("This invite is invalid or expired.");
  }

  const createdUser = await adminAuth().createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    displayName: input.name,
  });

  await invite.ref.set(
    {
      email: input.email.trim().toLowerCase(),
      name: input.name,
      role: invite.raw.role || "Worker",
      phone: invite.raw.phone || "",
      invitedBy: invite.raw.invitedBy || "",
      status: "active",
      authUid: createdUser.uid,
      removed: false,
      inviteAcceptedAt: serverTimestamp(),
      activatedAt: serverTimestamp(),
      inviteToken: "",
      inviteLink: "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await logActivity({
    action: `Accepted invite: ${input.email}`,
    doneBy: input.name,
    doneByEmail: input.email,
  });

  return {
    uid: createdUser.uid,
    email: input.email.trim().toLowerCase(),
  };
}
