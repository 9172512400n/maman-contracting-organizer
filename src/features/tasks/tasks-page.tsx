"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { Task } from "@/domain/tasks/types";
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
import { formatDate } from "@/lib/utils";

export default function TasksPage() {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

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

  const currentTask = tasks.find((item) => item.id === editingTaskId) ?? null;
  const filteredTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((task) =>
      !needle ||
      [task.title, task.description, task.dueDate, task.status]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [search, tasks]);

  async function onSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      await saveTask(new FormData(event.currentTarget), session);
      setDialogOpen(false);
      setEditingTaskId(null);
      await loadTasks();
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
      if (editingTaskId === id) {
        setEditingTaskId(null);
        setDialogOpen(false);
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
          <h1>Tasks & Reminders</h1>
          <p className="muted">Open the list, then create or edit tasks from a popup.</p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => {
            setEditingTaskId(null);
            setDialogOpen(true);
          }}
        >
          Add task
        </button>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title="Tasks & reminders">
        <div className="stack">
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, description, date, or status..."
          />

          {loading ? (
            <p className="muted">Loading tasks...</p>
          ) : filteredTasks.length === 0 ? (
            <EmptyState title="No tasks found" description="Create the first reminder or adjust the search." />
          ) : (
            <div className="stack">
              {filteredTasks.map((task) => (
                <div className="record-card" key={task.id}>
                  <div className="record-header">
                    <div className="stack">
                      <div className="inline-meta">
                        <StatusPill
                          label={task.status}
                          tone={task.status === "done" ? "success" : task.status === "closed" ? "default" : "warning"}
                        />
                        {task.dueDate ? <span className="muted">{formatDate(task.dueDate)}</span> : null}
                        {task.dueTime ? <span className="muted">{task.dueTime}</span> : null}
                      </div>
                      <strong>{task.title}</strong>
                      {task.description ? <p className="muted">{task.description}</p> : null}
                    </div>
                    <div className="actions-row">
                      <button
                        className="button-ghost"
                        type="button"
                        onClick={() => {
                          setEditingTaskId(task.id);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </button>
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

                  <details className="record-details">
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
                        <input className="search-input" name="noteText" placeholder="Add a note" />
                        <button className="button-ghost" type="submit">
                          Add note
                        </button>
                      </form>

                      {task.status !== "closed" ? (
                        <form className="actions-row" onSubmit={onCloseTask}>
                          <input name="id" type="hidden" value={task.id} />
                          <input className="search-input" name="noteText" placeholder="Closeout note" />
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
        </div>
      </SectionCard>

      <Dialog
        open={dialogOpen}
        title={currentTask ? "Edit task" : "Add task"}
        description="Create a task or reminder in the same legacy collection."
        onClose={() => {
          setDialogOpen(false);
          setEditingTaskId(null);
        }}
      >
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
          <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              className="button-ghost"
              type="button"
              onClick={() => {
                setDialogOpen(false);
                setEditingTaskId(null);
              }}
            >
              Cancel
            </button>
            <button className="button" type="submit">
              {currentTask ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
