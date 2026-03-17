"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { deleteContact, saveContact } from "@/server/repositories/contacts-repository";

function collectSingleFile(formData: FormData, key: string) {
  const entry = formData.get(key);
  return entry instanceof File && entry.size > 0 ? entry : null;
}

function revalidateContacts() {
  revalidatePath("/contacts");
  revalidatePath("/jobs");
}

export async function saveContactAction(formData: FormData) {
  const session = await requireSession();
  const id = await saveContact(
    formData,
    session.email,
    {
      photo: collectSingleFile(formData, "photo"),
      bizCard: collectSingleFile(formData, "bizCard"),
    },
  );
  revalidateContacts();
  redirect(`/contacts${id ? `?edit=${id}` : ""}`);
}

export async function deleteContactAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteContact(id);
  revalidateContacts();
}
