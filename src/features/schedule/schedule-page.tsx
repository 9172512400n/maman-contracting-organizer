"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { jobStatusTone } from "@/domain/jobs/mapper";
import type { Job } from "@/domain/jobs/types";
import { JobEditorForm } from "@/features/jobs/job-editor-form";
import { buildJobShareText, buildPermitText, buildParkingText, shareText } from "@/features/jobs/job-utils";
import {
  deleteJob,
  deleteScheduleNote,
  listJobs,
  listScheduleNotes,
  saveJob,
  saveScheduleNote,
} from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import { formatDate } from "@/lib/utils";

type CrewFilter = "all" | "asphalt" | "concrete";

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMondayOfWeek(referenceDate: Date, offsetWeeks: number) {
  const date = new Date(referenceDate);
  const dayOfWeek = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDays(monday: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

function crewFilterLabel(filter: CrewFilter) {
  switch (filter) {
    case "asphalt":
      return "Asphalt";
    case "concrete":
      return "Concrete";
    default:
      return "All crews";
  }
}

function matchesCrew(job: Job, filter: CrewFilter) {
  if (filter === "all") return true;
  const crew = (job.jobType || "").trim().toLowerCase();
  if (filter === "asphalt") return crew.includes("asphalt");
  if (filter === "concrete") return crew.includes("concrete");
  return true;
}

function inferCrewTone(job: Job) {
  return matchesCrew(job, "asphalt") ? "warning" : "info";
}

function buildDayShareText(date: Date, jobs: Job[], note?: string) {
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const lines = [`Maman Contracting — ${label}`, ""];
  if (note) {
    lines.push(`Note: ${note}`);
    lines.push("");
  }

  if (jobs.length === 0) {
    lines.push("No jobs scheduled.");
    return lines.join("\n");
  }

  jobs.forEach((job, index) => {
    lines.push(`${job.address || "—"}${job.customerName ? ` (${job.customerName})` : ""}`);
    if (job.taskType) lines.push(`Work: ${job.taskType}`);
    if (job.projectSize) lines.push(`Size: ${job.projectSize}`);
    const parking = buildParkingText(job);
    if (parking) lines.push(`Alt parking: ${parking}`);
    const permit = buildPermitText(job);
    if (permit) lines.push(`Permit: ${permit}`);
    if (job.notes) lines.push(`Notes: ${job.notes}`);
    if (index < jobs.length - 1) lines.push("");
  });

  return lines.join("\n");
}

export default function SchedulePage() {
  const { session } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [scheduleNotes, setScheduleNotes] = useState<Record<string, { date: string; note: string; updatedAt: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crewFilter, setCrewFilter] = useState<CrewFilter>("all");
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSeed, setDialogSeed] = useState(0);
  const [dialogPrefill, setDialogPrefill] = useState<Partial<Job>>({});
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [editingNoteDay, setEditingNoteDay] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  async function loadScheduleBoard() {
    setLoading(true);
    setError(null);
    try {
      const [nextJobs, nextNotes] = await Promise.all([listJobs(), listScheduleNotes()]);
      setJobs(nextJobs);
      setScheduleNotes(nextNotes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load schedule.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.isActive) {
      return;
    }

    void loadScheduleBoard();
  }, [session?.isActive]);

  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const weekStart = useMemo(() => getMondayOfWeek(today, weekOffset), [today, weekOffset]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEnd = weekDays[6];
  const currentJob = jobs.find((job) => job.id === editingJobId) ?? null;

  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesCrew(job, crewFilter)),
    [crewFilter, jobs],
  );
  const scheduledJobs = useMemo(
    () => filteredJobs.filter((job) => job.scheduleDay),
    [filteredJobs],
  );
  const unscheduledJobs = useMemo(
    () => filteredJobs.filter((job) => !job.scheduleDay),
    [filteredJobs],
  );

  function openCreateJobDialog(scheduleDay = "") {
    setEditingJobId(null);
    setDialogPrefill({
      scheduleDay,
      jobType:
        crewFilter === "all" ? "" : crewFilter === "asphalt" ? "Asphalt" : "Concrete",
    });
    setDialogSeed((current) => current + 1);
    setDialogOpen(true);
  }

  function openEditJobDialog(id: string) {
    setEditingJobId(id);
    setDialogPrefill({});
    setDialogSeed((current) => current + 1);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingJobId(null);
    setDialogPrefill({});
  }

  function toggleExpanded(jobId: string) {
    setExpandedJobs((current) => ({
      ...current,
      [jobId]: !(current[jobId] ?? false),
    }));
  }

  async function onSaveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      await saveJob(new FormData(event.currentTarget), session);
      closeDialog();
      await loadScheduleBoard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save job.");
    }
  }

  async function onDeleteJob(job: Job) {
    if (!session) {
      return;
    }

    setError(null);
    try {
      await deleteJob(job.id, session, job.address);
      closeDialog();
      await loadScheduleBoard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete job.");
    }
  }

  async function onSaveDayNote(isoDate: string) {
    const draft = (noteDrafts[isoDate] ?? "").trim();
    setError(null);
    try {
      if (!draft) {
        await deleteScheduleNote(isoDate);
      } else {
        await saveScheduleNote(isoDate, draft);
      }
      setEditingNoteDay(null);
      setNoteDrafts((current) => {
        const next = { ...current };
        delete next[isoDate];
        return next;
      });
      await loadScheduleBoard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save day note.");
    }
  }

  async function onDeleteDayNote(isoDate: string) {
    setError(null);
    try {
      await deleteScheduleNote(isoDate);
      setEditingNoteDay(null);
      await loadScheduleBoard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete day note.");
    }
  }

  const upcomingWeeks = useMemo(() => {
    return Array.from({ length: 13 }, (_, index) => {
      const offset = index - 4;
      const start = getMondayOfWeek(today, offset);
      const end = getWeekDays(start)[6];
      return { offset, start, end };
    });
  }, [today]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1>Weekly schedule</h1>
          <p className="muted">View the week, sort by crew, and place jobs where they need to go.</p>
        </div>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard
        title="Schedule"
        description={`Viewing ${crewFilterLabel(crewFilter)} for ${formatDate(toIsoDate(weekStart))} – ${formatDate(
          toIsoDate(weekEnd),
        )}.`}
      >
        <div className="stack">
          <div className="filter-row">
            {(
              [
                { id: "all", label: "All crews" },
                { id: "asphalt", label: "Asphalt" },
                { id: "concrete", label: "Concrete" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                className="filter-chip"
                data-active={crewFilter === item.id}
                type="button"
                onClick={() => setCrewFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="schedule-week-bar">
            <button className="button-ghost" type="button" onClick={() => setWeekOffset((current) => current - 1)}>
              &lt;
            </button>
            <strong>
              {formatDate(toIsoDate(weekStart))} – {formatDate(toIsoDate(weekEnd))}
            </strong>
            <button className="button-ghost" type="button" onClick={() => setWeekOffset((current) => current + 1)}>
              &gt;
            </button>
            <select
              className="schedule-week-select"
              value={String(weekOffset)}
              onChange={(event) => setWeekOffset(Number(event.target.value))}
            >
              {upcomingWeeks.map((week) => (
                <option key={week.offset} value={week.offset}>
                  {formatDate(toIsoDate(week.start))} – {formatDate(toIsoDate(week.end))}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="muted">Loading schedule...</p>
          ) : (
            <div className="schedule-list">
              {weekDays.map((day) => {
                const isoDate = toIsoDate(day);
                const isToday = isoDate === toIsoDate(today);
                const dayJobs = scheduledJobs.filter((job) => job.scheduleDay === isoDate);
                const dayNote = scheduleNotes[isoDate]?.note ?? "";
                const noteDraft = noteDrafts[isoDate] ?? dayNote;

                return (
                  <section className="schedule-day-card" data-today={isToday} key={isoDate}>
                    <div className="schedule-day-head">
                      <div className="stack" style={{ gap: 8 }}>
                        <strong className="schedule-day-title">
                          {day.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </strong>
                        {editingNoteDay === isoDate ? (
                          <div className="schedule-note-editor">
                            <input
                              value={noteDraft}
                              onChange={(event) =>
                                setNoteDrafts((current) => ({
                                  ...current,
                                  [isoDate]: event.target.value,
                                }))
                              }
                              placeholder="No work, weather delay, available to schedule..."
                            />
                            <div className="actions-row">
                              <button className="button-secondary" type="button" onClick={() => void onSaveDayNote(isoDate)}>
                                Save note
                              </button>
                              {dayNote ? (
                                <button className="button-danger" type="button" onClick={() => void onDeleteDayNote(isoDate)}>
                                  Delete note
                                </button>
                              ) : null}
                              <button className="button-ghost" type="button" onClick={() => setEditingNoteDay(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : dayNote ? (
                          <div className="schedule-day-note">
                            <span>{dayNote}</span>
                            <div className="actions-row">
                              <button
                                className="button-ghost"
                                type="button"
                                onClick={() => {
                                  setEditingNoteDay(isoDate);
                                  setNoteDrafts((current) => ({ ...current, [isoDate]: dayNote }));
                                }}
                              >
                                Edit note
                              </button>
                              <button className="button-ghost" type="button" onClick={() => void onDeleteDayNote(isoDate)}>
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="button-ghost"
                            type="button"
                            onClick={() => {
                              setEditingNoteDay(isoDate);
                              setNoteDrafts((current) => ({ ...current, [isoDate]: "" }));
                            }}
                          >
                            + Note
                          </button>
                        )}
                      </div>

                      <div className="actions-row">
                        <button className="button-secondary" type="button" onClick={() => openCreateJobDialog(isoDate)}>
                          + Add job
                        </button>
                        <button
                          className="button-ghost"
                          type="button"
                          onClick={() => void shareText(
                            `Schedule ${formatDate(isoDate)}`,
                            buildDayShareText(day, dayJobs, dayNote),
                          )}
                        >
                          Share day
                        </button>
                      </div>
                    </div>

                    {dayJobs.length === 0 ? (
                      <p className="muted">(Available to schedule)</p>
                    ) : (
                      <div className="stack">
                        {dayJobs.map((job) => {
                          const expanded = expandedJobs[job.id] ?? false;
                          const parking = buildParkingText(job);
                          const permit = buildPermitText(job);
                          return (
                            <div className="schedule-job-card" data-expanded={expanded} key={job.id}>
                              <button className="schedule-job-toggle" type="button" onClick={() => toggleExpanded(job.id)}>
                                <div className="inline-meta">
                                  <span className="schedule-job-accent" data-tone={matchesCrew(job, "asphalt") ? "warning" : "info"} />
                                  <strong>{job.address || "Untitled job"}</strong>
                                </div>
                                <span className="muted">{expanded ? "Hide" : "Show"}</span>
                              </button>
                              {expanded ? (
                                <div className="schedule-job-body">
                                  <div className="record-meta-grid">
                                    <span className="muted">Customer: {job.customerName || "—"}</span>
                                    <span className="muted">Email: {job.email || "—"}</span>
                                    <span className="muted">Work: {job.taskType || "—"}</span>
                                    <span className="muted">Size: {job.projectSize || "—"}</span>
                                    <span className="muted">Crew: {job.jobType || "—"}</span>
                                    <span className="muted">Status: {job.status || "—"}</span>
                                    {parking ? <span className="muted">Alt parking: {parking}</span> : null}
                                    {permit ? <span className="muted">Permit: {permit}</span> : null}
                                  </div>
                                  {job.notes ? <p className="muted">{job.notes}</p> : null}
                                  <div className="actions-row">
                                    <StatusPill label={job.status || "Pending"} tone={jobStatusTone(job.status)} />
                                    <StatusPill label={job.jobType || "Unassigned"} tone={inferCrewTone(job)} />
                                    <button className="button" type="button" onClick={() => openEditJobDialog(job.id)}>
                                      Edit job
                                    </button>
                                    <button
                                      className="button-secondary"
                                      type="button"
                                      onClick={() => void shareText(job.address || "Job", buildJobShareText(job))}
                                    >
                                      Share
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}

              <section className="schedule-day-card">
                <div className="schedule-day-head">
                  <div>
                    <strong className="schedule-day-title">Date TBD</strong>
                    <p className="muted">Jobs without a schedule day still waiting to be placed.</p>
                  </div>
                  <button className="button" type="button" onClick={() => openCreateJobDialog("")}>
                    + Add job
                  </button>
                </div>

                {unscheduledJobs.length === 0 ? (
                  <EmptyState title="No unscheduled jobs" description="Everything already has a day assigned." />
                ) : (
                  <div className="stack">
                    {unscheduledJobs.map((job) => {
                      const expanded = expandedJobs[job.id] ?? false;
                      const parking = buildParkingText(job);
                      const permit = buildPermitText(job);
                      return (
                        <div className="schedule-job-card" data-expanded={expanded} key={job.id}>
                          <button className="schedule-job-toggle" type="button" onClick={() => toggleExpanded(job.id)}>
                            <div className="stack" style={{ gap: 2 }}>
                              <strong>{job.address || "Untitled job"}</strong>
                              {job.customerName ? <span className="muted">{job.customerName}</span> : null}
                            </div>
                            <span className="muted">{expanded ? "Hide" : "Show"}</span>
                          </button>
                          {expanded ? (
                            <div className="schedule-job-body">
                              <div className="record-meta-grid">
                                <span className="muted">Customer: {job.customerName || "—"}</span>
                                <span className="muted">Email: {job.email || "—"}</span>
                                <span className="muted">Work: {job.taskType || "—"}</span>
                                <span className="muted">Size: {job.projectSize || "—"}</span>
                                <span className="muted">Crew: {job.jobType || "—"}</span>
                                <span className="muted">Status: {job.status || "—"}</span>
                                {parking ? <span className="muted">Alt parking: {parking}</span> : null}
                                {permit ? <span className="muted">Permit: {permit}</span> : null}
                              </div>
                              {job.notes ? <p className="muted">{job.notes}</p> : null}
                              <div className="actions-row">
                                <button className="button" type="button" onClick={() => openEditJobDialog(job.id)}>
                                  Edit job
                                </button>
                                <button
                                  className="button-secondary"
                                  type="button"
                                  onClick={() => void shareText(job.address || "Job", buildJobShareText(job))}
                                >
                                  Share
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </SectionCard>

      <Dialog
        open={dialogOpen}
        title={currentJob ? "Edit job" : "Add job"}
        description="Update the job details and assign the right schedule day."
        onClose={closeDialog}
      >
        <JobEditorForm
          key={currentJob?.id ?? `schedule-${dialogSeed}`}
          job={currentJob}
          prefill={dialogPrefill}
          onSubmit={onSaveJob}
          onCancel={closeDialog}
          onDelete={currentJob ? () => onDeleteJob(currentJob) : undefined}
          submitLabel={currentJob ? "Update job" : "Create job"}
        />
      </Dialog>
    </>
  );
}
