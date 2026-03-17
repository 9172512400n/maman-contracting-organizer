import { asString, asTaskNotes } from "@/domain/common/legacy";
import type { Task } from "@/domain/tasks/types";

export function mapLegacyTask(id: string, raw: Record<string, unknown>): Task {
  return {
    id,
    title: asString(raw.title),
    dueDate: asString(raw.dueDate),
    dueTime: asString(raw.dueTime),
    description: asString(raw.description),
    createdBy: asString(raw.createdBy),
    createdByName: asString(raw.createdByName),
    createdAt: asString(raw.createdAt),
    status: (asString(raw.status) || "open") as Task["status"],
    doneBy: asString(raw.doneBy),
    doneByName: asString(raw.doneByName),
    doneAt: asString(raw.doneAt),
    closedBy: asString(raw.closedBy),
    closedAt: asString(raw.closedAt),
    notes: asTaskNotes(raw.notes),
  };
}
