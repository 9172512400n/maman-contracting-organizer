"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "@/lib/utils";
import {
  addTaskNote,
  closeTask,
  deleteTask,
  listTasks,
  markTaskDone,
  reopenTask,
  saveTask,
} from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import type { Task } from "@/domain/tasks/types";

export default function TasksPage() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") ?? "";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      setTasks(await listTasks());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.isActive) {
      return;
    }

    void loadTasks();
  }, [session?.isActive]);

  const currentTask = tasks.find((item) => item.id === editId) ?? null;

  async function onSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      const id = await saveTask(new FormData(event.currentTarget), session);
      await loadTasks();
      router.replace(`/tasks?edit=${id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save task.");
    }
  }

  async function onMarkDone(id: string) {
    if (!session) {
      return;
    }

    setError(null);
    try {
      await markTaskDone(id, session);
      await loadTasks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not mark task done.");
    }
  }

  async function onReopen(id: string) {
    setError(null);
    try {
      await reopenTask(id);
      await loadTasks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not reopen task.");
    }
  }

  async function onDeleteTask(id: string) {
    setError(null);
    try {
      await deleteTask(id);
      await loadTasks();
      if (editId === id) {
        router.replace("/tasks");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete task.");
    }
  }

  async function onAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = String(formData.get("id") ?? "");
    const noteText = String(formData.get("noteText") ?? "").trim();
    if (!id || !noteText) {
      return;
    }

    setError(null);
    try {
      await addTaskNote(id, session, noteText);
      form.reset();
      await loadTasks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not add note.");
    }
  }

  async function onCloseTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = String(formData.get("id") ?? "");
    const noteText = String(formData.get("noteText") ?? "").trim();
    if (!id || !noteText) {
      return;
    }

    setError(null);
    try {
      await closeTask(id, session, noteText);
      form.reset();
      await loadTasks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not close task.");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h1>Tasks and reminders</h1>
          <p className="muted">Legacy task document shape, client-side lifecycle actions.</p>
        </div>
        {currentTask ? (
          <Link className="button-ghost" href="/tasks">
            Clear edit
          </Link>
        ) : null}
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title={currentTask ? "Edit task" : "Create task"}>
        <form key={currentTask?.id ?? "new"} className="form-grid" onSubmit={onSaveTask}>
          <input name="id" type="hidden" value={currentTask?.id ?? ""} />
          <div className="field" data-span="2">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" defaultValue={currentTask?.title} />
          </div>
          <div className="field">
            <label htmlFor="dueDate">Due date</label>
            <input id="dueDate" name="dueDate" type="date" defaultValue={currentTask?.dueDate} />
          </div>
          <div className="field">
            <label htmlFor="dueTime">Due time</label>
            <input id="dueTime" name="dueTime" type="time" defaultValue={currentTask?.dueTime} />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" defaultValue={currentTask?.description} />
          </div>
          <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
            <button className="button" type="submit">
              {currentTask ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Tasks">
        {loading ? (
          <p className="muted">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks yet" description="Create the first reminder from the form above." />
        ) : (
          <div className="stack">
            {tasks.map((task) => (
              <div className="section-card" key={task.id}>
                <div className="page-header">
                  <div className="stack">
                    <div className="inline-meta">
                      <StatusPill
                        label={task.status}
                        tone={task.status === "done" ? "success" : task.status === "closed" ? "default" : "warning"}
                      />
                      {task.dueDate ? <span className="muted">{formatDate(task.dueDate)}</span> : null}
                    </div>
                    <strong>{task.title}</strong>
                    {task.description ? <p className="muted">{task.description}</p> : null}
                  </div>
                  <div className="actions-row">
                    <Link className="button-ghost" href={`/tasks?edit=${task.id}`}>
                      Edit
                    </Link>
                    {task.status === "open" ? (
                      <button className="button-secondary" type="button" onClick={() => void onMarkDone(task.id)}>
                        Mark done
                      </button>
                    ) : (
                      <button className="button-ghost" type="button" onClick={() => void onReopen(task.id)}>
                        Reopen
                      </button>
                    )}
                    <button className="button-danger" type="button" onClick={() => void onDeleteTask(task.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <details>
                  <summary className="muted">Notes and closeout</summary>
                  <div className="stack" style={{ marginTop: 12 }}>
                    {task.notes.length ? (
                      task.notes.map((note, index) => (
                        <div className="card" key={`${task.id}-${index}`}>
                          <strong>{note.text}</strong>
                          <p className="muted">
                            {note.addedByName || note.author || note.addedBy || "Unknown"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <EmptyState title="No notes yet" description="Use the forms below to append notes." />
                    )}
                    <form className="actions-row" onSubmit={onAddNote}>
                      <input name="id" type="hidden" value={task.id} />
                      <input name="noteText" placeholder="Add a note" />
                      <button className="button-ghost" type="submit">
                        Add note
                      </button>
                    </form>
                    {task.status !== "closed" ? (
                      <form className="actions-row" onSubmit={onCloseTask}>
                        <input name="id" type="hidden" value={task.id} />
                        <input name="noteText" placeholder="Closeout note" />
                        <button className="button-ghost" type="submit">
                          Close task
                        </button>
                      </form>
                    ) : null}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
