import { z } from "zod";
import type { TaskUpsertInput } from "@/domain/tasks/types";

const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Task title is required"),
  dueDate: z.string().trim().default(""),
  dueTime: z.string().trim().default(""),
  description: z.string().trim().default(""),
});

export function parseTaskFormData(formData: FormData): TaskUpsertInput {
  return taskSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
    title: String(formData.get("title") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    dueTime: String(formData.get("dueTime") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
}
