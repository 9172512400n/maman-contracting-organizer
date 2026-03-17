"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { jobStatusTone } from "@/domain/jobs/mapper";
import type { Job } from "@/domain/jobs/types";
import { deleteJob, listJobs, saveJob } from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import { formatDate } from "@/lib/utils";

const jobFilters = ["All", "Open", "In Progress", "Completed", "Blocked", "On Hold"] as const;

export default function JobsPage() {
  const { session } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof jobFilters)[number]>("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

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

  const currentJob = jobs.find((job) => job.id === editingJobId) ?? null;
  const filteredJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesSearch =
        !needle ||
        [job.address, job.customerName, job.permitNumber, job.permitCode, job.taskType]
          .join(" ")
          .toLowerCase()
          .includes(needle);

      if (!matchesSearch) {
        return false;
      }

      switch (filter) {
        case "Open":
          return job.status === "Pending" || job.status === "Open";
        case "In Progress":
          return job.status === "In Progress";
        case "Completed":
          return job.status === "Completed";
        case "Blocked":
          return job.blocked === "yes" || job.status === "Blocked";
        case "On Hold":
          return job.status === "On Hold";
        default:
          return true;
      }
    });
  }, [filter, jobs, search]);

  async function onSaveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      await saveJob(new FormData(event.currentTarget), session);
      setDialogOpen(false);
      setEditingJobId(null);
      await loadJobs();
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
      if (editingJobId === job.id) {
        setEditingJobId(null);
        setDialogOpen(false);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete job.");
    }
  }

  function openCreateDialog() {
    setEditingJobId(null);
    setDialogOpen(true);
  }

  function openEditDialog(id: string) {
    setEditingJobId(id);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Jobs</p>
          <h1>Job management</h1>
          <p className="muted">Search and filter the existing legacy job records.</p>
        </div>
        <button className="button" type="button" onClick={openCreateDialog}>
          + New job
        </button>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title="Jobs" description="List-first view with the legacy search and status filters restored.">
        <div className="stack">
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by address, customer, permit #, task type..."
          />

          <div className="filter-row">
            {jobFilters.map((item) => (
              <button
                key={item}
                className="filter-chip"
                data-active={filter === item}
                type="button"
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="muted">Loading jobs...</p>
          ) : filteredJobs.length === 0 ? (
            <EmptyState title="No jobs found" description="Try a different search or create a new job." />
          ) : (
            <div className="stack">
              {filteredJobs.map((job) => (
                <div className="record-card" key={job.id}>
                  <div className="record-header">
                    <div className="stack">
                      <strong>{job.address || "Untitled job"}</strong>
                      <div className="inline-meta">
                        {job.taskType ? <span className="pill" data-tone="warning">{job.taskType}</span> : null}
                        {job.customerName ? <span className="muted">{job.customerName}</span> : null}
                        {job.permitNumber || job.permitCode ? (
                          <span className="muted">{job.permitNumber || job.permitCode}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="actions-row">
                      <StatusPill label={job.status || "Unknown"} tone={jobStatusTone(job.status)} />
                      <button className="button-ghost" type="button" onClick={() => openEditDialog(job.id)}>
                        Edit
                      </button>
                      <button className="button-danger" type="button" onClick={() => void onDeleteJob(job)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="record-meta-grid">
                    <span className="muted">Customer: {job.customerName || "—"}</span>
                    <span className="muted">Scheduled: {formatDate(job.scheduleDay)}</span>
                    <span className="muted">Blocked: {job.blocked === "yes" ? "Yes" : "No"}</span>
                    <span className="muted">Crew: {job.jobType || "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <Dialog
        open={dialogOpen}
        title={currentJob ? "Edit job" : "Add job"}
        description="Writes to the same legacy `jobs` collection."
        onClose={() => {
          setDialogOpen(false);
          setEditingJobId(null);
        }}
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
              <option value="Asphalt">Asphalt</option>
              <option value="Concrete">Concrete</option>
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
          <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              className="button-ghost"
              type="button"
              onClick={() => {
                setDialogOpen(false);
                setEditingJobId(null);
              }}
            >
              Cancel
            </button>
            <button className="button" type="submit">
              {currentJob ? "Save changes" : "Create job"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
