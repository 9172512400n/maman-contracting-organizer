"use client";

import { createUserWithEmailAndPassword, deleteUser, updateProfile } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { mapLegacyActivity } from "@/domain/activity/mapper";
import { parseActivityInput } from "@/domain/activity/schema";
import type { ActivityEntry } from "@/domain/activity/types";
import {
  asAttachmentLinks,
  asCustomFields,
  asPermitChips,
  asTaskNotes,
  stringifyLegacyJson,
} from "@/domain/common/legacy";
import type { AttachmentLink } from "@/domain/common/types";
import { mapLegacyContact } from "@/domain/contacts/mapper";
import { parseContactFormData } from "@/domain/contacts/schema";
import type { Contact, ContactUpsertInput } from "@/domain/contacts/types";
import { mapLegacyJob } from "@/domain/jobs/mapper";
import { parseJobFormData } from "@/domain/jobs/schema";
import { mapLegacyNotification } from "@/domain/notifications/mapper";
import { parseNotificationFormData } from "@/domain/notifications/schema";
import type { Notification } from "@/domain/notifications/types";
import { mapLegacyPermit } from "@/domain/permits/mapper";
import { parsePermitFormData } from "@/domain/permits/schema";
import { mapLegacyTask } from "@/domain/tasks/mapper";
import { parseTaskFormData } from "@/domain/tasks/schema";
import { dedupeUsersByEmail, mapLegacyUser } from "@/domain/users/mapper";
import { parseInviteFormData, parseUserUpdateFormData } from "@/domain/users/schema";
import { appEnv } from "@/lib/env";
import { getClientAuth, getClientDb, getClientStorage } from "@/lib/firebase/client";
import type { AppSession } from "@/lib/firebase/auth-utils";
import { normalizePhone, buildInviteDocId } from "@/lib/utils";

type Actor = Pick<AppSession, "email" | "name">;

function buildIsoNow() {
  return new Date().toISOString();
}

function sortByNewest<T>(items: T[], pick: (item: T) => string) {
  return [...items].sort((left, right) => {
    const leftTs = Date.parse(pick(left) || "1970-01-01");
    const rightTs = Date.parse(pick(right) || "1970-01-01");
    return rightTs - leftTs;
  });
}

function randomInviteToken() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

async function uploadFilesToStorage(folder: string, files: File[]) {
  const storage = getClientStorage();
  const uploaded: AttachmentLink[] = [];

  for (const file of files) {
    if (!(file instanceof File) || file.size <= 0) {
      continue;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${folder}/${Date.now()}_${safeName}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file, {
      contentType: file.type || "application/octet-stream",
    });
    const url = await getDownloadURL(fileRef);

    uploaded.push({
      name: file.name,
      url,
    });
  }

  return uploaded;
}

function appendAttachments(existing: unknown, uploaded: AttachmentLink[]) {
  return [...asAttachmentLinks(existing), ...uploaded];
}

async function listContactsInternal() {
  const snapshot = await getDocs(collection(getClientDb(), "contacts"));
  return snapshot.docs
    .map((item) => mapLegacyContact(item.id, item.data()))
    .sort((left, right) => left.companyName.localeCompare(right.companyName));
}

function buildPeople(input: ContactUpsertInput, existing?: Contact) {
  const remaining = existing?.persons.slice(1) ?? [];
  if (!input.primaryPersonName && !input.primaryPersonPhone) {
    return existing?.persons ?? [];
  }

  return [
    {
      name: input.primaryPersonName,
      phone: input.primaryPersonPhone,
      role: input.primaryPersonRole,
    },
    ...remaining,
  ].filter((person) => person.name || person.phone);
}

export async function listActivity(limitCount = 20): Promise<ActivityEntry[]> {
  const snapshot = await getDocs(collection(getClientDb(), "activity"));
  return sortByNewest(
    snapshot.docs.map((item) => mapLegacyActivity(item.id, item.data())),
    (entry) => entry.timestamp,
  ).slice(0, limitCount);
}

export async function logActivity(input: Record<string, unknown>) {
  const payload = parseActivityInput(input);
  await addDoc(collection(getClientDb(), "activity"), {
    ...payload,
    timestamp: buildIsoNow(),
  });
}

export async function listNotifications(limitCount = 20): Promise<Notification[]> {
  const snapshot = await getDocs(collection(getClientDb(), "notifications"));
  return sortByNewest(
    snapshot.docs.map((item) => mapLegacyNotification(item.id, item.data())),
    (entry) => entry.timestamp,
  ).slice(0, limitCount);
}

export async function createNotification(formData: FormData, sender: Actor) {
  const payload = parseNotificationFormData(formData);
  await addDoc(collection(getClientDb(), "notifications"), {
    message: payload.message,
    sentBy: sender.name || sender.email,
    sentByEmail: sender.email,
    timestamp: buildIsoNow(),
    read: false,
  });
}

export async function deleteNotification(id: string) {
  await deleteDoc(doc(getClientDb(), "notifications", id));
}

export async function listJobs() {
  const snapshot = await getDocs(collection(getClientDb(), "jobs"));
  return snapshot.docs
    .map((item) => mapLegacyJob(item.id, item.data()))
    .sort((left, right) => Date.parse(right.createdAt || "1970-01-01") - Date.parse(left.createdAt || "1970-01-01"));
}

export async function getJobById(id: string) {
  const snapshot = await getDoc(doc(getClientDb(), "jobs", id));
  if (!snapshot.exists()) {
    return null;
  }

  return mapLegacyJob(snapshot.id, snapshot.data());
}

async function upsertContactFromJob(job: {
  customerName: string;
  phone: string;
  email: string;
  address: string;
}, actorEmail: string) {
  if (!job.customerName && !job.phone) {
    return;
  }

  const contacts = await listContactsInternal();
  const phoneKey = normalizePhone(job.phone);
  const existing =
    contacts.find((contact) =>
      contact.persons.some((person) => normalizePhone(person.phone) === phoneKey),
    ) ??
    contacts.find((contact) => normalizePhone(contact.phone) === phoneKey) ??
    contacts.find(
      (contact) => contact.companyName.toLowerCase() === job.customerName.trim().toLowerCase(),
    );

  if (existing) {
    const nextPeople = existing.persons.length
      ? existing.persons.map((person, index) =>
          index === 0
            ? {
                ...person,
                name: person.name || job.customerName,
                phone: job.phone || person.phone,
              }
            : person,
        )
      : job.phone
        ? [{ name: job.customerName, phone: job.phone, role: "Customer" }]
        : [];

    await setDoc(
      doc(getClientDb(), "contacts", existing.id),
      {
        email: job.email || existing.email,
        address: job.address || existing.address,
        persons: nextPeople,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  await setDoc(doc(collection(getClientDb(), "contacts")), {
    companyName: job.customerName,
    phone: job.phone,
    email: job.email,
    address: job.address,
    notes: "",
    persons: job.phone
      ? [{ name: job.customerName, phone: job.phone, role: "Customer" }]
      : [],
    createdBy: actorEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveJob(formData: FormData, actor: Actor) {
  const input = parseJobFormData(formData);
  const docRef = input.id ? doc(getClientDb(), "jobs", input.id) : doc(collection(getClientDb(), "jobs"));
  const existingRaw = input.id ? (await getDoc(docRef)).data() ?? {} : {};
  const permitFiles = formData
    .getAll("permitFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const uploadedDocs = await uploadFilesToStorage("jobs/permit-docs", permitFiles);
  const combinedDocs = appendAttachments(existingRaw.permitDocUrls ?? existingRaw.permitDocUrl, uploadedDocs);
  const permits =
    input.permitNumber || input.permitCode || input.permitExpiry
      ? [{ number: input.permitNumber, code: input.permitCode, expiry: input.permitExpiry }]
      : asPermitChips(existingRaw.permits);

  const payload = {
    customerName: input.customerName,
    phone: input.phone,
    email: input.email,
    invoiceNumber: input.invoiceNumber,
    address: input.address,
    taskType: input.taskType,
    projectSize: input.projectSize,
    jobType: input.jobType,
    concreteSub: input.concreteSub,
    altParkingBlocked: input.altParkingBlocked,
    altParkingDays: input.altParkingBlocked ? "Fully blocked off by client" : input.altParkingDays,
    altParkingTime: input.altParkingBlocked ? "" : input.altParkingTime,
    blocked: input.blocked,
    status: input.status,
    scheduleDay: input.scheduleDay,
    completionDay: input.completionDay,
    permits: stringifyLegacyJson(permits),
    permitCode: input.permitCode,
    permitNumber: input.permitNumber,
    permitExpiry: input.permitExpiry,
    notes: input.notes,
    customFields: stringifyLegacyJson(asCustomFields(existingRaw.customFields)),
    permitDocUrls: stringifyLegacyJson(combinedDocs),
    permitDocUrl: combinedDocs[0]?.url ?? "",
    updatedBy: actor.email,
    updatedAt: serverTimestamp(),
  };

  await setDoc(
    docRef,
    input.id
      ? { ...existingRaw, ...payload }
      : {
          ...existingRaw,
          ...payload,
          createdBy: actor.email,
          createdAt: serverTimestamp(),
        },
    { merge: true },
  );

  await upsertContactFromJob(
    {
      customerName: input.customerName,
      phone: input.phone,
      email: input.email,
      address: input.address,
    },
    actor.email,
  );

  await logActivity({
    action: input.id ? "Updated job" : "Created job",
    jobAddress: input.address,
    doneBy: actor.name,
    doneByEmail: actor.email,
  });

  return docRef.id;
}

export async function deleteJob(id: string, actor: Actor, address: string) {
  await deleteDoc(doc(getClientDb(), "jobs", id));
  await logActivity({
    action: "Deleted job",
    jobAddress: address,
    doneBy: actor.name,
    doneByEmail: actor.email,
  });
}

export async function setJobScheduleDay(id: string, scheduleDay: string, actor: Actor, address: string) {
  await setDoc(
    doc(getClientDb(), "jobs", id),
    {
      scheduleDay,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await logActivity({
    action: "Updated schedule",
    jobAddress: address,
    doneBy: actor.name,
    doneByEmail: actor.email,
  });
}

export async function listPermits() {
  const snapshot = await getDocs(collection(getClientDb(), "permits"));
  return snapshot.docs
    .map((item) => mapLegacyPermit(item.id, item.data()))
    .sort((left, right) => Date.parse(right.createdAt || "1970-01-01") - Date.parse(left.createdAt || "1970-01-01"));
}

export async function getPermitById(id: string) {
  const snapshot = await getDoc(doc(getClientDb(), "permits", id));
  if (!snapshot.exists()) {
    return null;
  }

  return mapLegacyPermit(snapshot.id, snapshot.data());
}

export async function savePermit(formData: FormData, actor: Actor) {
  const input = parsePermitFormData(formData);
  const docRef = input.id ? doc(getClientDb(), "permits", input.id) : doc(collection(getClientDb(), "permits"));
  const existingRaw = input.id ? (await getDoc(docRef)).data() ?? {} : {};
  const docFiles = formData
    .getAll("permitFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const uploadedDocs = await uploadFilesToStorage("permits/documents", docFiles);
  const combinedDocs = appendAttachments(existingRaw.docUrls ?? existingRaw.docUrl, uploadedDocs);

  const payload = {
    permitNumber: input.permitNumber,
    permitTypeCode: input.permitTypeCode,
    validFrom: input.validFrom,
    expirationDate: input.expirationDate,
    permitHolder: input.permitHolder,
    jobAddress: input.jobAddress,
    status: input.status,
    notes: input.notes,
    linkedJobId: input.linkedJobId,
    docUrl: combinedDocs[0]?.url ?? "",
    docUrls: combinedDocs,
    updatedBy: actor.email,
    updatedAt: buildIsoNow(),
  };

  await setDoc(
    docRef,
    input.id
      ? { ...existingRaw, ...payload }
      : {
          ...existingRaw,
          ...payload,
          createdBy: actor.email,
          createdAt: buildIsoNow(),
          archived: false,
          dotNotified: false,
          dotNotifiedDate: "",
        },
    { merge: true },
  );

  return docRef.id;
}

export async function setPermitArchived(id: string, archived: boolean) {
  await setDoc(doc(getClientDb(), "permits", id), { archived }, { merge: true });
}

export async function setPermitDotNotified(id: string, dotNotified: boolean) {
  await setDoc(
    doc(getClientDb(), "permits", id),
    {
      dotNotified,
      dotNotifiedDate: dotNotified ? buildIsoNow() : "",
    },
    { merge: true },
  );
}

export async function deletePermit(id: string) {
  await deleteDoc(doc(getClientDb(), "permits", id));
}

export async function listContacts() {
  return listContactsInternal();
}

export async function getContactById(id: string) {
  const snapshot = await getDoc(doc(getClientDb(), "contacts", id));
  if (!snapshot.exists()) {
    return null;
  }

  return mapLegacyContact(snapshot.id, snapshot.data());
}

export async function saveContact(formData: FormData, actor: Actor) {
  const input = parseContactFormData(formData);
  const docRef = input.id ? doc(getClientDb(), "contacts", input.id) : doc(collection(getClientDb(), "contacts"));
  const existing = input.id ? await getContactById(input.id) : null;
  const photo = formData.get("photo");
  const bizCard = formData.get("bizCard");
  const photoUploads = photo instanceof File && photo.size > 0
    ? await uploadFilesToStorage("contacts/photos", [photo])
    : [];
  const bizUploads = bizCard instanceof File && bizCard.size > 0
    ? await uploadFilesToStorage("contacts/business-cards", [bizCard])
    : [];
  const photoUpload = photoUploads[0];
  const bizUpload = bizUploads[0];

  const payload = {
    companyName: input.companyName,
    phone: input.phone,
    email: input.email,
    address: input.address,
    notes: input.notes,
    persons: buildPeople(input, existing ?? undefined),
    photoURL: photoUpload?.url ?? existing?.photoURL ?? "",
    bizCardURL: bizUpload?.url ?? existing?.bizCardURL ?? "",
    updatedAt: serverTimestamp(),
  };

  await setDoc(
    docRef,
    input.id
      ? { ...(existing ?? {}), ...payload }
      : {
          ...payload,
          createdBy: actor.email,
          createdAt: serverTimestamp(),
        },
    { merge: true },
  );

  return docRef.id;
}

export async function deleteContact(id: string) {
  await deleteDoc(doc(getClientDb(), "contacts", id));
}

export async function listTasks() {
  const snapshot = await getDocs(collection(getClientDb(), "tasks"));
  const items = snapshot.docs.map((item) => mapLegacyTask(item.id, item.data()));
  return items.sort((left, right) => {
    if (left.status === "open" && right.status !== "open") return -1;
    if (left.status !== "open" && right.status === "open") return 1;
    if (left.status === "open" && right.status === "open") {
      return (left.dueDate || "9999-12-31").localeCompare(right.dueDate || "9999-12-31");
    }
    return Date.parse(right.createdAt || "1970-01-01") - Date.parse(left.createdAt || "1970-01-01");
  });
}

export async function getTaskById(id: string) {
  const snapshot = await getDoc(doc(getClientDb(), "tasks", id));
  if (!snapshot.exists()) {
    return null;
  }

  return mapLegacyTask(snapshot.id, snapshot.data());
}

export async function saveTask(formData: FormData, actor: Actor) {
  const input = parseTaskFormData(formData);
  const docRef = input.id ? doc(getClientDb(), "tasks", input.id) : doc(collection(getClientDb(), "tasks"));
  const existingRaw = input.id ? (await getDoc(docRef)).data() ?? {} : {};
  const notes = stringifyLegacyJson(asTaskNotes(existingRaw.notes));
  const payload = {
    title: input.title,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    description: input.description,
    notes,
  };

  await setDoc(
    docRef,
    input.id
      ? { ...existingRaw, ...payload }
      : {
          ...existingRaw,
          ...payload,
          createdBy: actor.email,
          createdByName: actor.name,
          createdAt: buildIsoNow(),
          status: "open",
        },
    { merge: true },
  );

  return docRef.id;
}

async function updateTask(id: string, patch: Record<string, unknown>) {
  const docRef = doc(getClientDb(), "tasks", id);
  const existingRaw = (await getDoc(docRef)).data() ?? {};
  await setDoc(
    docRef,
    {
      ...existingRaw,
      ...patch,
    },
    { merge: true },
  );
}

export async function markTaskDone(id: string, actor: Actor) {
  await updateTask(id, {
    status: "done",
    doneBy: actor.email,
    doneByName: actor.name,
    doneAt: buildIsoNow(),
  });
}

export async function closeTask(id: string, actor: Actor, noteText: string) {
  const task = await getTaskById(id);
  const notes = [...(task?.notes ?? []), { text: noteText, author: actor.name, timestamp: buildIsoNow() }];
  await updateTask(id, {
    status: "closed",
    closedBy: actor.email,
    closedAt: buildIsoNow(),
    notes: stringifyLegacyJson(notes),
  });
}

export async function reopenTask(id: string) {
  await updateTask(id, {
    status: "open",
    doneBy: "",
    doneByName: "",
    doneAt: "",
    closedBy: "",
    closedAt: "",
  });
}

export async function addTaskNote(id: string, actor: Actor, noteText: string) {
  const task = await getTaskById(id);
  const notes = [
    ...(task?.notes ?? []),
    {
      text: noteText,
      addedBy: actor.email,
      addedByName: actor.name,
      addedAt: buildIsoNow(),
    },
  ];
  await updateTask(id, { notes: stringifyLegacyJson(notes) });
}

export async function deleteTask(id: string) {
  await deleteDoc(doc(getClientDb(), "tasks", id));
}

export async function listUsers() {
  const snapshot = await getDocs(collection(getClientDb(), "users"));
  const users = dedupeUsersByEmail(snapshot.docs.map((item) => mapLegacyUser(item.id, item.data())));
  return users.sort((left, right) => Date.parse(right.updatedAt || right.invitedAt || "1970-01-01") - Date.parse(left.updatedAt || left.invitedAt || "1970-01-01"));
}

export async function getUserById(id: string) {
  const snapshot = await getDoc(doc(getClientDb(), "users", id));
  if (!snapshot.exists()) {
    return null;
  }

  return mapLegacyUser(snapshot.id, snapshot.data());
}

export async function createOrRefreshInvite(formData: FormData, invitedBy: Actor) {
  const input = parseInviteFormData(formData);
  const email = input.email.trim().toLowerCase();
  const docId = buildInviteDocId(email);
  const docRef = doc(getClientDb(), "users", docId);
  const existing = (await getDoc(docRef)).data() ?? {};

  if (existing.authUid || existing.status === "active") {
    throw new Error("That user is already active.");
  }

  const token = randomInviteToken();
  const inviteLink = `${appEnv.publicAppUrl}/invite?email=${encodeURIComponent(email)}&invite=${token}`;

  await setDoc(
    docRef,
    {
      ...existing,
      email,
      name: existing.name ?? "",
      role: input.role,
      phone: existing.phone ?? "",
      invitedBy: invitedBy.email,
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
    doneBy: invitedBy.name,
    doneByEmail: invitedBy.email,
  });

  return inviteLink;
}

export async function updateUser(formData: FormData) {
  const input = parseUserUpdateFormData(formData);
  await setDoc(
    doc(getClientDb(), "users", input.id),
    {
      name: input.name,
      role: input.role,
      phone: input.phone,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeUser(id: string, actor: Actor) {
  await setDoc(
    doc(getClientDb(), "users", id),
    {
      removed: true,
      removedAt: serverTimestamp(),
      removedBy: actor.email,
    },
    { merge: true },
  );
}

export async function resolveInviteRecord(email: string, token: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const deterministicRef = doc(getClientDb(), "users", buildInviteDocId(normalizedEmail));
  const deterministic = await getDoc(deterministicRef);
  if (deterministic.exists()) {
    const data = deterministic.data() ?? {};
    if ((data.email || "").trim().toLowerCase() === normalizedEmail && data.inviteToken === token && !data.removed) {
      return { id: deterministic.id, ref: deterministicRef, raw: data };
    }
  }

  const querySnapshot = await getDocs(
    query(collection(getClientDb(), "users"), where("email", "==", normalizedEmail), limit(5)),
  );
  const fallback = querySnapshot.docs.find((item) => {
    const data = item.data() ?? {};
    return data.inviteToken === token && !data.removed;
  });

  if (!fallback) {
    return null;
  }

  return { id: fallback.id, ref: fallback.ref, raw: fallback.data() ?? {} };
}

export async function acceptInviteClient(input: {
  email: string;
  token: string;
  name: string;
  password: string;
}) {
  const auth = await getClientAuth();
  const createdUser = await createUserWithEmailAndPassword(auth, input.email.trim().toLowerCase(), input.password);

  try {
    await updateProfile(createdUser.user, { displayName: input.name }).catch(() => undefined);
    const invite = await resolveInviteRecord(input.email, input.token);
    if (!invite || invite.raw.status !== "invited") {
      throw new Error("This invite is invalid or expired.");
    }

    await setDoc(
      invite.ref,
      {
        email: input.email.trim().toLowerCase(),
        name: input.name,
        role: invite.raw.role || "Worker",
        phone: invite.raw.phone || "",
        invitedBy: invite.raw.invitedBy || "",
        status: "active",
        authUid: createdUser.user.uid,
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

    return createdUser.user;
  } catch (error) {
    await deleteUser(createdUser.user).catch(() => undefined);
    throw error;
  }
}
