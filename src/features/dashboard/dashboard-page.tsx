"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  clearActivity,
  createNotification,
  deleteNotification,
  listActivity,
  listJobs,
  listNotifications,
  listPermits,
  listTasks,
  saveTask,
} from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import { formatDate, formatDateTime } from "@/lib/utils";
import { jobStatusTone } from "@/domain/jobs/mapper";
import type { ActivityEntry } from "@/domain/activity/types";
import type { Job } from "@/domain/jobs/types";
import type { Notification } from "@/domain/notifications/types";
import type { Permit } from "@/domain/permits/types";
import type { Task } from "@/domain/tasks/types";

function daysUntil(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DashboardPage() {
  const { session } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentJobsSearch, setRecentJobsSearch] = useState("");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [nextJobs, nextPermits, nextTasks, nextNotifications, nextActivity] = await Promise.all([
        listJobs(),
        listPermits(),
        listTasks(),
        listNotifications(),
        listActivity(),
      ]);
      setJobs(nextJobs);
      setPermits(nextPermits);
      setTasks(nextTasks);
      setNotifications(nextNotifications);
      setActivity(nextActivity);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.isActive) {
      return;
    }

    void loadDashboard();
  }, [session?.isActive]);

  async function onCreateNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const form = event.currentTarget;
    setError(null);
    try {
      await createNotification(new FormData(form), session);
      form.reset();
      await loadDashboard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create notification.");
    }
  }

  async function onDeleteNotification(id: string) {
    setError(null);
    try {
      await deleteNotification(id);
      await loadDashboard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete notification.");
    }
  }

  async function onSaveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const form = event.currentTarget;
    setError(null);
    try {
      await saveTask(new FormData(form), session);
      form.reset();
      setTaskDialogOpen(false);
      await loadDashboard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create task.");
    }
  }

  async function onClearActivity() {
    if (!session?.isAdmin) {
      return;
    }

    if (!window.confirm("Clear all activity log entries?")) {
      return;
    }

    setError(null);
    try {
      await clearActivity();
      await loadDashboard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not clear activity.");
    }
  }

  const upcomingPermitAlerts = [
    ...jobs
      .filter((job) => job.permitExpiry)
      .map((job) => ({
        label: job.permitNumber || job.permitCode || "Job permit",
        address: job.address,
        expiry: job.permitExpiry,
      })),
    ...permits
      .filter((permit) => !permit.archived && permit.expirationDate)
      .map((permit) => ({
        label: permit.permitNumber,
        address: permit.jobAddress,
        expiry: permit.expirationDate,
      })),
  ].filter((item) => {
    const days = daysUntil(item.expiry);
    return days !== null && days >= 0 && days <= 4;
  });

  const openJobs = jobs.filter((job) => ["Pending", "In Progress"].includes(job.status));
  const completedJobs = jobs.filter((job) => job.status === "Completed");
  const blockedJobs = jobs.filter((job) => job.blocked === "yes");
  const urgentTasks = tasks.filter((task) => task.status === "open" && task.dueDate);
  const recentJobs = useMemo(() => {
    const needle = recentJobsSearch.trim().toLowerCase();
    const filtered = !needle
      ? jobs
      : jobs.filter((job) =>
        [job.customerName, job.address, job.permitNumber, job.permitCode, job.taskType]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );

    return filtered.slice(0, 8);
  }, [jobs, recentJobsSearch]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Operations hub</p>
          <h1>Dashboard</h1>
          {/* <p className="muted">Legacy Firebase collections, client-side Firebase data access.</p> */}
        </div>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <div className="stats-grid">
        <div className="card">
          <span className="muted">Total jobs</span>
          <div className="stat-value">{jobs.length}</div>
        </div>
        <div className="card">
          <span className="muted">Open jobs</span>
          <div className="stat-value">{openJobs.length}</div>
        </div>
        <div className="card">
          <span className="muted">Completed jobs</span>
          <div className="stat-value">{completedJobs.length}</div>
        </div>
        <div className="card">
          <span className="muted">Urgent tasks</span>
          <div className="stat-value">{urgentTasks.length}</div>
        </div>
      </div>

      <div className="panel-grid">
        <SectionCard
          title="Recent jobs"
          description="Latest records from the legacy `jobs` collection."
        >
          <div className="toolbar-row" style={{ marginBottom: 16 }}>
            <input
              className="search-input"
              value={recentJobsSearch}
              onChange={(event) => setRecentJobsSearch(event.target.value)}
              placeholder="Search by address, customer, permit #, task type..."
            />
          </div>
          {loading ? (
            <p className="muted">Loading jobs...</p>
          ) : recentJobs.length === 0 ? (
            <EmptyState title="No jobs yet" description="Create the first job from the Jobs page." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.customerName || "—"}</td>
                      <td>{job.address || "—"}</td>
                      <td>
                        <StatusPill label={job.status || "Unknown"} tone={jobStatusTone(job.status)} />
                      </td>
                      <td>{formatDate(job.scheduleDay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Alerts" description="Upcoming permit expirations and blocked work.">
          <div className="stack">
            {loading ? (
              <p className="muted">Checking alerts...</p>
            ) : upcomingPermitAlerts.length === 0 ? (
              <EmptyState title="No active alerts" description="Nothing expires in the next four days." />
            ) : (
              upcomingPermitAlerts.map((alert) => (
                <div className="card" key={`${alert.label}-${alert.address}`}>
                  <strong>{alert.label}</strong>
                  <p className="muted">{alert.address}</p>
                  <p>Expires {formatDate(alert.expiry)}</p>
                </div>
              ))
            )}
            {blockedJobs.length > 0 ? (
              <div className="callout">{blockedJobs.length} job(s) are currently marked blocked.</div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="panel-grid">
        <SectionCard
          title="Tasks & Reminders"
          description="Open, done, and closed task records."
          action={
            <button className="button-secondary" type="button" onClick={() => setTaskDialogOpen(true)}>
              Add task
            </button>
          }
        >
          {loading ? (
            <p className="muted">Loading tasks...</p>
          ) : tasks.length === 0 ? (
            <EmptyState title="No tasks yet" description="Create tasks from the Tasks page." />
          ) : (
            <div className="stack">
              {tasks.slice(0, 8).map((task) => (
                <div className="card" key={task.id}>
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
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Notifications"
          description="Still backed by the legacy `notifications` collection."
          action={
            session?.isAdmin ? (
              <button
                className="button-secondary"
                type="button"
                onClick={() => setNotificationDialogOpen(true)}
              >
                + Push notification
              </button>
            ) : null
          }
        >
          <div className="stack">
            {loading ? (
              <p className="muted">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <EmptyState title="No notifications" description="Admin broadcast messages will appear here." />
            ) : (
              notifications.map((notification) => (
                <div className="card" key={notification.id}>
                  <div className="page-header">
                    <div>
                      <strong>{notification.message}</strong>
                      <p className="muted">
                        {notification.sentBy || notification.sentByEmail} · {formatDateTime(notification.timestamp)}
                      </p>
                    </div>
                    {session?.isAdmin ? (
                      <button
                        className="button-danger"
                        type="button"
                        onClick={() => {
                          void onDeleteNotification(notification.id);
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Activity log"
        description="Recent records from the legacy `activity` collection."
        action={
          session?.isAdmin ? (
            <button className="button-danger" type="button" onClick={() => void onClearActivity()}>
              Clear
            </button>
          ) : null
        }
      >
        {loading ? (
          <p className="muted">Loading activity...</p>
        ) : activity.length === 0 ? (
          <EmptyState title="No activity yet" description="Mutation actions will append activity records here." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Context</th>
                  <th>Actor</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.action}</td>
                    <td>{entry.jobAddress || entry.taskTitle || entry.note || "—"}</td>
                    <td>{entry.doneBy || entry.doneByEmail || "—"}</td>
                    <td>{formatDateTime(entry.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={taskDialogOpen}
        title="Add task"
        description="Create a task or reminder without leaving the dashboard."
        onClose={() => setTaskDialogOpen(false)}
      >
        <form className="form-grid" onSubmit={onSaveTask}>
          <div className="field" data-span="2">
            <label htmlFor="dashboard-task-title">Title</label>
            <input id="dashboard-task-title" name="title" />
          </div>
          <div className="field">
            <label htmlFor="dashboard-task-date">Due date</label>
            <input id="dashboard-task-date" name="dueDate" type="date" />
          </div>
          <div className="field">
            <label htmlFor="dashboard-task-time">Due time</label>
            <input id="dashboard-task-time" name="dueTime" type="time" />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="dashboard-task-description">Description</label>
            <textarea id="dashboard-task-description" name="description" />
          </div>
          <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
            <button className="button-ghost" type="button" onClick={() => setTaskDialogOpen(false)}>
              Cancel
            </button>
            <button className="button" type="submit">
              Save task
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={notificationDialogOpen}
        title="Push notification"
        description="Broadcast a message to the team."
        onClose={() => setNotificationDialogOpen(false)}
      >
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            await onCreateNotification(event);
            setNotificationDialogOpen(false);
          }}
        >
          <div className="field">
            <label htmlFor="notification-message">Message</label>
            <textarea id="notification-message" name="message" placeholder="Type your message to the team..." />
          </div>
          <div className="dialog-actions">
            <button className="button-ghost" type="button" onClick={() => setNotificationDialogOpen(false)}>
              Cancel
            </button>
            <button className="button-secondary" type="submit">
              Send
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
