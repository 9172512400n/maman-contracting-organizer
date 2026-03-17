"use client";

import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getClientDb } from "@/lib/firebase/client";
import { buildInviteDocId } from "@/lib/utils";

export type AppSession = {
  uid: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  isAdmin: boolean;
};

async function loadLegacyUserRecord(user: User) {
  const email = (user.email ?? "").trim().toLowerCase();
  const authUid = user.uid;
  const db = getClientDb();

  try {
    if (email) {
      const deterministicRef = doc(db, "users", buildInviteDocId(email));
      const deterministicSnapshot = await getDoc(deterministicRef);
      if (deterministicSnapshot.exists()) {
        return deterministicSnapshot.data();
      }
    }

    const byUid = await getDocs(
      query(collection(db, "users"), where("authUid", "==", authUid), limit(1)),
    );
    if (!byUid.empty) {
      return byUid.docs[0]?.data() ?? null;
    }

    if (email) {
      const byEmail = await getDocs(
        query(collection(db, "users"), where("email", "==", email), limit(1)),
      );
      if (!byEmail.empty) {
        return byEmail.docs[0]?.data() ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function sessionFromUser(user: User): Promise<AppSession> {
  const userRecord = await loadLegacyUserRecord(user);
  const role =
    typeof userRecord?.role === "string" && userRecord.role.trim() ? userRecord.role.trim() : "Worker";
  const recordName =
    typeof userRecord?.name === "string" && userRecord.name.trim() ? userRecord.name.trim() : "";
  return {
    uid: user.uid,
    email: user.email ?? "",
    name: recordName || user.displayName || user.email || "",
    role,
    isActive: true,
    isAdmin: role === "Admin",
  };
}

export async function refreshSession(user: User, forceRefresh = false) {
  if (forceRefresh) {
    await user.getIdToken(true);
  }
  return sessionFromUser(user);
}
