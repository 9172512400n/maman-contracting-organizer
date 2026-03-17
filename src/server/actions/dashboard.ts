"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import {
  createNotification,
  deleteNotification,
} from "@/server/repositories/notifications-repository";

export async function createNotificationAction(formData: FormData) {
  const session = await requireSession();
  if (!session.isAdmin) {
    throw new Error("Only admins can send notifications.");
  }

  await createNotification(formData, { email: session.email, name: session.name });
  revalidatePath("/dashboard");
}

export async function deleteNotificationAction(formData: FormData) {
  const session = await requireSession();
  if (!session.isAdmin) {
    throw new Error("Only admins can delete notifications.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteNotification(id);
  revalidatePath("/dashboard");
}
