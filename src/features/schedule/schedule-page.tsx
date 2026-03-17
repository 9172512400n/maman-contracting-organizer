"use client";

import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "@/lib/utils";
import { listJobs, setJobScheduleDay } from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import type { Job } from "@/domain/jobs/types";

export default function SchedulePage() {
  const { session } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadJobsBoard() {
    setLoading(true);
    setError(null);
    try {
      setJobs(await listJobs());
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

    void loadJobsBoard();
  }, [session?.isActive]);

  async function onSaveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const id = String(formData.get("id") ?? "");
    const address = String(formData.get("address") ?? "");
    const scheduleDay = String(formData.get("scheduleDay") ?? "");
    if (!id) {
      return;
    }

    setError(null);
    try {
      await setJobScheduleDay(id, scheduleDay, session, address);
      await loadJobsBoard();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update schedule.");
    }
  }

  const scheduled = jobs.filter((job) => job.scheduleDay);
  const unscheduled = jobs.filter((job) => !job.scheduleDay);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1>Schedule board</h1>
          <p className="muted">A cleaner view over the same `scheduleDay` field on job documents.</p>
        </div>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title="Scheduled jobs">
        {loading ? (
          <p className="muted">Loading scheduled jobs...</p>
        ) : scheduled.length === 0 ? (
          <EmptyState title="Nothing scheduled yet" description="Assign a date to any job below." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Crew</th>
                  <th>Date</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.customerName || "—"}</strong>
                      <p className="muted">{job.address || "—"}</p>
                    </td>
                    <td>
                      <StatusPill label={job.jobType || "Unassigned"} tone="info" />
                    </td>
                    <td>{formatDate(job.scheduleDay)}</td>
                    <td>
                      <form className="actions-row" onSubmit={onSaveSchedule}>
                        <input name="id" type="hidden" value={job.id} />
                        <input name="address" type="hidden" value={job.address} />
                        <input name="scheduleDay" type="date" defaultValue={job.scheduleDay} />
                        <button className="button-ghost" type="submit">
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Unscheduled jobs">
        {loading ? (
          <p className="muted">Loading unscheduled jobs...</p>
        ) : unscheduled.length === 0 ? (
          <EmptyState title="Everything is scheduled" description="No unscheduled jobs remain." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Assign date</th>
                </tr>
              </thead>
              <tbody>
                {unscheduled.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.customerName || "—"}</strong>
                      <p className="muted">{job.address || "—"}</p>
                    </td>
                    <td>{job.status}</td>
                    <td>
                      <form className="actions-row" onSubmit={onSaveSchedule}>
                        <input name="id" type="hidden" value={job.id} />
                        <input name="address" type="hidden" value={job.address} />
                        <input name="scheduleDay" type="date" />
                        <button className="button" type="submit">
                          Assign
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
