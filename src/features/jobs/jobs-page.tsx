"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { jobStatusTone } from "@/domain/jobs/mapper";
import { formatDate } from "@/lib/utils";
import { deleteJob, listJobs, saveJob } from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import type { Job } from "@/domain/jobs/types";

export default function JobsPage() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") ?? "";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      setJobs(await listJobs());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.isActive) {
      return;
    }

    void loadJobs();
  }, [session?.isActive]);

  const currentJob = jobs.find((job) => job.id === editId) ?? null;

  async function onSaveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      const id = await saveJob(new FormData(event.currentTarget), session);
      await loadJobs();
      router.replace(`/jobs?edit=${id}`);
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
      await loadJobs();
      if (editId === job.id) {
        router.replace("/jobs");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete job.");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Jobs</p>
          <h1>Job management</h1>
          <p className="muted">Client-side CRUD against the frozen `jobs` collection.</p>
        </div>
        {currentJob ? (
          <Link className="button-ghost" href="/jobs">
            Clear edit
          </Link>
        ) : null}
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard
        title={currentJob ? "Edit job" : "Create job"}
        description="This form writes the same legacy field names directly with the Firebase Web SDK."
      >
        <form key={currentJob?.id ?? "new"} className="form-grid" onSubmit={onSaveJob}>
          <input name="id" type="hidden" value={currentJob?.id ?? ""} />
          <div className="field">
            <label htmlFor="customerName">Customer</label>
            <input id="customerName" name="customerName" defaultValue={currentJob?.customerName} />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" defaultValue={currentJob?.phone} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" defaultValue={currentJob?.email} />
          </div>
          <div className="field">
            <label htmlFor="invoiceNumber">Invoice</label>
            <input id="invoiceNumber" name="invoiceNumber" defaultValue={currentJob?.invoiceNumber} />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="address">Address</label>
            <input id="address" name="address" defaultValue={currentJob?.address} />
          </div>
          <div className="field">
            <label htmlFor="taskType">Task type</label>
            <input id="taskType" name="taskType" defaultValue={currentJob?.taskType} />
          </div>
          <div className="field">
            <label htmlFor="projectSize">Project size</label>
            <input id="projectSize" name="projectSize" defaultValue={currentJob?.projectSize} />
          </div>
          <div className="field">
            <label htmlFor="jobType">Crew</label>
            <select id="jobType" name="jobType" defaultValue={currentJob?.jobType || ""}>
              <option value="">None</option>
              <option value="asphalt">Asphalt</option>
              <option value="concrete">Concrete</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="concreteSub">Concrete sub</label>
            <input id="concreteSub" name="concreteSub" defaultValue={currentJob?.concreteSub} />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={currentJob?.status || "Pending"}>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
              <option>On Hold</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="blocked">Blocked</label>
            <select id="blocked" name="blocked" defaultValue={currentJob?.blocked || "no"}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="scheduleDay">Schedule day</label>
            <input id="scheduleDay" name="scheduleDay" type="date" defaultValue={currentJob?.scheduleDay} />
          </div>
          <div className="field">
            <label htmlFor="completionDay">Completion day</label>
            <input id="completionDay" name="completionDay" type="date" defaultValue={currentJob?.completionDay} />
          </div>
          <div className="field">
            <label htmlFor="permitNumber">Permit number</label>
            <input id="permitNumber" name="permitNumber" defaultValue={currentJob?.permitNumber} />
          </div>
          <div className="field">
            <label htmlFor="permitCode">Permit code</label>
            <input id="permitCode" name="permitCode" defaultValue={currentJob?.permitCode} />
          </div>
          <div className="field">
            <label htmlFor="permitExpiry">Permit expiry</label>
            <input id="permitExpiry" name="permitExpiry" type="date" defaultValue={currentJob?.permitExpiry} />
          </div>
          <div className="field">
            <label htmlFor="permitFiles">Permit documents</label>
            <input id="permitFiles" name="permitFiles" type="file" multiple />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" defaultValue={currentJob?.notes} />
          </div>
          <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
            <button className="button" type="submit">
              {currentJob ? "Save changes" : "Create job"}
            </button>
          </div>
        </form>
        {currentJob?.permitDocUrls.length ? (
          <div className="stack" style={{ marginTop: 16 }}>
            <strong>Existing permit docs</strong>
            {currentJob.permitDocUrls.map((item) => (
              <a key={item.url} className="muted" href={item.url} target="_blank" rel="noreferrer">
                {item.name}
              </a>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Jobs" description="Current contents of the legacy collection.">
        {loading ? (
          <p className="muted">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <EmptyState title="No jobs yet" description="Create the first job from the form above." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Permit</th>
                  <th>Scheduled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.customerName || "—"}</td>
                    <td>{job.address || "—"}</td>
                    <td>
                      <StatusPill label={job.status || "Unknown"} tone={jobStatusTone(job.status)} />
                    </td>
                    <td>{job.permitNumber || job.permitCode || "—"}</td>
                    <td>{formatDate(job.scheduleDay)}</td>
                    <td>
                      <div className="actions-row">
                        <Link className="button-ghost" href={`/jobs?edit=${job.id}`}>
                          Edit
                        </Link>
                        <button
                          className="button-danger"
                          type="button"
                          onClick={() => {
                            void onDeleteJob(job);
                          }}
                        >
                          Delete
                        </button>
                      </div>
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
