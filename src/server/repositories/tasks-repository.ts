import { adminDb } from "@/server/firebase/admin";
import { asTaskNotes, stringifyLegacyJson } from "@/domain/common/legacy";
import { mapLegacyTask } from "@/domain/tasks/mapper";
import { parseTaskFormData } from "@/domain/tasks/schema";
import { buildIsoNow } from "@/server/repositories/helpers";

const tasksCollection = () => adminDb().collection("tasks");

export async function listTasks() {
  const snapshot = await tasksCollection().get();
  const items = snapshot.docs.map((doc) => mapLegacyTask(doc.id, doc.data()));
  return items.sort((left, right) => {
    if (left.status === "open" && right.status !== "open") return -1;
    if (left.status !== "open" && right.status === "open") return 1;
    if (left.status === "open" && right.status === "open") {
      return (left.dueDate || "9999-12-31").localeCompare(right.dueDate || "9999-12-31");
    }
    return Date.parse(right.createdAt || "1970-01-01") - Date.parse(left.createdAt || "1970-01-01");
  });
}

export async function getTaskById(id: string) {
  const snapshot = await tasksCollection().doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapLegacyTask(snapshot.id, snapshot.data() ?? {});
}

export async function saveTask(formData: FormData, actor: { email: string; name: string }) {
  const input = parseTaskFormData(formData);
  const docRef = input.id ? tasksCollection().doc(input.id) : tasksCollection().doc();
  const existingRaw = input.id ? (await docRef.get()).data() ?? {} : {};
  const notes = stringifyLegacyJson(asTaskNotes(existingRaw.notes));

  const payload = {
    title: input.title,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
    description: input.description,
    notes,
  };

  if (input.id) {
    await docRef.set(
      {
        ...existingRaw,
        ...payload,
      },
      { merge: true },
    );
    return docRef.id;
  }

  await docRef.set({
    ...existingRaw,
    ...payload,
    createdBy: actor.email,
    createdByName: actor.name,
    createdAt: buildIsoNow(),
    status: "open",
  });
  return docRef.id;
}

async function updateTask(id: string, patch: Record<string, unknown>) {
  const docRef = tasksCollection().doc(id);
  const existingRaw = (await docRef.get()).data() ?? {};
  await docRef.set(
    {
      ...existingRaw,
      ...patch,
    },
    { merge: true },
  );
}

export async function markTaskDone(id: string, actor: { email: string; name: string }) {
  await updateTask(id, {
    status: "done",
    doneBy: actor.email,
    doneByName: actor.name,
    doneAt: buildIsoNow(),
  });
}

export async function closeTask(id: string, actor: { email: string; name: string }, noteText: string) {
  const task = await getTaskById(id);
  const notes = [...(task?.notes ?? []), { text: noteText, author: actor.name, timestamp: buildIsoNow() }];
  await updateTask(id, {
    status: "closed",
    closedBy: actor.email,
    closedAt: buildIsoNow(),
    notes: stringifyLegacyJson(notes),
  });
}

export async function reopenTask(id: string) {
  await updateTask(id, {
    status: "open",
    doneBy: "",
    doneByName: "",
    doneAt: "",
    closedBy: "",
    closedAt: "",
  });
}

export async function addTaskNote(id: string, actor: { email: string; name: string }, noteText: string) {
  const task = await getTaskById(id);
  const notes = [
    ...(task?.notes ?? []),
    {
      text: noteText,
      addedBy: actor.email,
      addedByName: actor.name,
      addedAt: buildIsoNow(),
    },
  ];
  await updateTask(id, { notes: stringifyLegacyJson(notes) });
}

export async function deleteTask(id: string) {
  await tasksCollection().doc(id).delete();
}
