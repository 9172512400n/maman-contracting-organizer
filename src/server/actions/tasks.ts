"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import {
  addTaskNote,
  closeTask,
  deleteTask,
  markTaskDone,
  reopenTask,
  saveTask,
} from "@/server/repositories/tasks-repository";

function revalidateTasks() {
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}

export async function saveTaskAction(formData: FormData) {
  const session = await requireSession();
  const id = await saveTask(formData, { email: session.email, name: session.name });
  revalidateTasks();
  redirect(`/tasks${id ? `?edit=${id}` : ""}`);
}

export async function markTaskDoneAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markTaskDone(id, { email: session.email, name: session.name });
  revalidateTasks();
}

export async function closeTaskAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const noteText = String(formData.get("noteText") ?? "").trim();
  if (!id) return;
  await closeTask(id, { email: session.email, name: session.name }, noteText);
  revalidateTasks();
}

export async function reopenTaskAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await reopenTask(id);
  revalidateTasks();
}

export async function addTaskNoteAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const noteText = String(formData.get("noteText") ?? "").trim();
  if (!id || !noteText) return;
  await addTaskNote(id, { email: session.email, name: session.name }, noteText);
  revalidateTasks();
}

export async function deleteTaskAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteTask(id);
  revalidateTasks();
}
