"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import {
  createOrRefreshInvite,
  removeUser,
  updateUser,
} from "@/server/repositories/users-repository";

function revalidateUsers() {
  revalidatePath("/users");
}

export async function createInviteAction(formData: FormData) {
  const session = await requireSession();
  if (!session.isAdmin) {
    throw new Error("Only admins can invite users.");
  }

  await createOrRefreshInvite(formData, session.email);
  revalidateUsers();
  redirect("/users");
}

export async function updateUserAction(formData: FormData) {
  const session = await requireSession();
  if (!session.isAdmin) {
    throw new Error("Only admins can update users.");
  }

  await updateUser(formData);
  revalidateUsers();
  redirect("/users");
}

export async function removeUserAction(formData: FormData) {
  const session = await requireSession();
  if (!session.isAdmin) {
    throw new Error("Only admins can remove users.");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await removeUser(id, session.email);
  revalidateUsers();
}
