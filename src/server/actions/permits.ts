"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import {
  deletePermit,
  savePermit,
  setPermitArchived,
  setPermitDotNotified,
} from "@/server/repositories/permits-repository";

function collectFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function revalidatePermits() {
  revalidatePath("/dashboard");
  revalidatePath("/permits");
}

export async function savePermitAction(formData: FormData) {
  const session = await requireSession();
  const id = await savePermit(formData, session.email, collectFiles(formData, "permitFiles"));
  revalidatePermits();
  redirect(`/permits${id ? `?edit=${id}` : ""}`);
}

export async function deletePermitAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deletePermit(id);
  revalidatePermits();
}

export async function archivePermitAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "true";
  if (!id) return;
  await setPermitArchived(id, archived);
  revalidatePermits();
}

export async function dotNotifiedAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const dotNotified = formData.get("dotNotified") === "true";
  if (!id) return;
  await setPermitDotNotified(id, dotNotified);
  revalidatePermits();
}
