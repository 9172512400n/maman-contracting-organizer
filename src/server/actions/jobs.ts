"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { deleteJob, saveJob, setJobScheduleDay } from "@/server/repositories/jobs-repository";
import { logActivity } from "@/server/repositories/activity-repository";

function collectFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function revalidateJobs() {
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  revalidatePath("/contacts");
  revalidatePath("/schedule");
}

export async function saveJobAction(formData: FormData) {
  const session = await requireSession();
  const id = await saveJob(formData, session.email, collectFiles(formData, "permitFiles"));
  await logActivity({
    action: formData.get("id") ? "Updated job" : "Created job",
    jobAddress: String(formData.get("address") ?? ""),
    doneBy: session.name,
    doneByEmail: session.email,
  });
  revalidateJobs();
  redirect(`/jobs${id ? `?edit=${id}` : ""}`);
}

export async function deleteJobAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const address = String(formData.get("address") ?? "");
  if (!id) return;
  await deleteJob(id);
  await logActivity({
    action: "Deleted job",
    jobAddress: address,
    doneBy: session.name,
    doneByEmail: session.email,
  });
  revalidateJobs();
}

export async function setScheduleDayAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const scheduleDay = String(formData.get("scheduleDay") ?? "");
  if (!id) return;
  await setJobScheduleDay(id, scheduleDay);
  await logActivity({
    action: "Updated schedule",
    jobAddress: String(formData.get("address") ?? ""),
    doneBy: session.name,
    doneByEmail: session.email,
  });
  revalidateJobs();
}
