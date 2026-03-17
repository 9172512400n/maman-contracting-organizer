import { randomBytes, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { AttachmentLink } from "@/domain/common/types";
import { asAttachmentLinks } from "@/domain/common/legacy";
import { appEnv } from "@/lib/env";
import { adminStorage } from "@/server/firebase/admin";

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

export function buildIsoNow() {
  return new Date().toISOString();
}

export function sortByNewest<T>(items: T[], pick: (item: T) => string) {
  return [...items].sort((left, right) => {
    const leftTs = Date.parse(pick(left) || "1970-01-01");
    const rightTs = Date.parse(pick(right) || "1970-01-01");
    return rightTs - leftTs;
  });
}

export function randomInviteToken() {
  return randomBytes(24).toString("hex");
}

export async function uploadFilesToStorage(folder: string, files: File[]) {
  const bucket = adminStorage();
  const uploaded: AttachmentLink[] = [];

  for (const file of files) {
    if (!(file instanceof File) || file.size <= 0) {
      continue;
    }

    const token = randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${folder}/${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await bucket.file(path).save(buffer, {
      metadata: {
        contentType: file.type || "application/octet-stream",
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
      resumable: false,
    });

    uploaded.push({
      name: file.name,
      url: `https://firebasestorage.googleapis.com/v0/b/${appEnv.firebaseAdmin.storageBucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
    });
  }

  return uploaded;
}

export function appendAttachments(existing: unknown, uploaded: AttachmentLink[]) {
  return [...asAttachmentLinks(existing), ...uploaded];
}
