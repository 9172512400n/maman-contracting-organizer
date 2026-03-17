import type { TaskNote } from "@/domain/common/types";

export type TaskStatus = "open" | "done" | "closed";

export type Task = {
  id: string;
  title: string;
  dueDate: string;
  dueTime: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: TaskStatus;
  doneBy: string;
  doneByName: string;
  doneAt: string;
  closedBy: string;
  closedAt: string;
  notes: TaskNote[];
};

export type TaskUpsertInput = {
  id?: string;
  title: string;
  dueDate: string;
  dueTime: string;
  description: string;
};
