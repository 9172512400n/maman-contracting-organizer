"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "@/lib/utils";
import {
  deletePermit,
  listJobs,
  listPermits,
  savePermit,
  setPermitArchived,
  setPermitDotNotified,
} from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import type { Job } from "@/domain/jobs/types";
import type { Permit } from "@/domain/permits/types";

export default function PermitsPage() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") ?? "";
  const [permits, setPermits] = useState<Permit[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPermitsPage() {
    setLoading(true);
    setError(null);
    try {
      const [nextPermits, nextJobs] = await Promise.all([listPermits(), listJobs()]);
      setPermits(nextPermits);
      setJobs(nextJobs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load permits.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.isActive) {
      return;
    }

    void loadPermitsPage();
  }, [session?.isActive]);

  const currentPermit = permits.find((item) => item.id === editId) ?? null;

  async function onSavePermit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      const id = await savePermit(new FormData(event.currentTarget), session);
      await loadPermitsPage();
      router.replace(`/permits?edit=${id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save permit.");
    }
  }

  async function onToggleArchive(permit: Permit) {
    setError(null);
    try {
      await setPermitArchived(permit.id, !permit.archived);
      await loadPermitsPage();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update archive state.");
    }
  }

  async function onToggleDot(permit: Permit) {
    setError(null);
    try {
      await setPermitDotNotified(permit.id, !permit.dotNotified);
      await loadPermitsPage();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update DOT state.");
    }
  }

  async function onDeletePermit(id: string) {
    setError(null);
    try {
      await deletePermit(id);
      await loadPermitsPage();
      if (editId === id) {
        router.replace("/permits");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete permit.");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Permits</p>
          <h1>Permit management</h1>
          <p className="muted">Same `permits` collection, client-side Firebase CRUD.</p>
        </div>
        {currentPermit ? (
          <Link className="button-ghost" href="/permits">
            Clear edit
          </Link>
        ) : null}
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title={currentPermit ? "Edit permit" : "Create permit"}>
        <form key={currentPermit?.id ?? "new"} className="form-grid" onSubmit={onSavePermit}>
          <input name="id" type="hidden" value={currentPermit?.id ?? ""} />
          <div className="field">
            <label htmlFor="permitNumber">Permit number</label>
            <input id="permitNumber" name="permitNumber" defaultValue={currentPermit?.permitNumber} />
          </div>
          <div className="field">
            <label htmlFor="permitTypeCode">Permit type code</label>
            <input id="permitTypeCode" name="permitTypeCode" defaultValue={currentPermit?.permitTypeCode} />
          </div>
          <div className="field">
            <label htmlFor="validFrom">Valid from</label>
            <input id="validFrom" name="validFrom" type="date" defaultValue={currentPermit?.validFrom} />
          </div>
          <div className="field">
            <label htmlFor="expirationDate">Expiration</label>
            <input id="expirationDate" name="expirationDate" type="date" defaultValue={currentPermit?.expirationDate} />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="permitHolder">Permit holder</label>
            <input id="permitHolder" name="permitHolder" defaultValue={currentPermit?.permitHolder} />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="jobAddress">Job address</label>
            <input id="jobAddress" name="jobAddress" defaultValue={currentPermit?.jobAddress} />
          </div>
          <div className="field">
            <label htmlFor="linkedJobId">Linked job</label>
            <select id="linkedJobId" name="linkedJobId" defaultValue={currentPermit?.linkedJobId || ""}>
              <option value="">No linked job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.customerName || job.address || job.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={currentPermit?.status || "Pending"}>
              <option>Pending</option>
              <option>Submitted</option>
              <option>Under Review</option>
              <option>Approved</option>
              <option>Issued</option>
              <option>Active</option>
              <option>Expired</option>
              <option>Rejected</option>
              <option>On Hold</option>
              <option>Cancelled</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="permitFiles">Documents</label>
            <input id="permitFiles" name="permitFiles" type="file" multiple />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" defaultValue={currentPermit?.notes} />
          </div>
          <div className="actions-row" style={{ gridColumn: "1 / -1" }}>
            <button className="button" type="submit">
              {currentPermit ? "Save changes" : "Create permit"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Permits">
        {loading ? (
          <p className="muted">Loading permits...</p>
        ) : permits.length === 0 ? (
          <EmptyState title="No permits yet" description="Create the first permit from the form above." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Permit</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Flags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {permits.map((permit) => (
                  <tr key={permit.id}>
                    <td>{permit.permitNumber || "—"}</td>
                    <td>{permit.jobAddress || "—"}</td>
                    <td>
                      <StatusPill label={permit.status || "Unknown"} tone={permit.archived ? "default" : "info"} />
                    </td>
                    <td>{formatDate(permit.expirationDate)}</td>
                    <td>
                      <div className="inline-meta">
                        {permit.archived ? <StatusPill label="Archived" tone="default" /> : null}
                        {permit.dotNotified ? <StatusPill label="DOT notified" tone="success" /> : null}
                      </div>
                    </td>
                    <td>
                      <div className="actions-row">
                        <Link className="button-ghost" href={`/permits?edit=${permit.id}`}>
                          Edit
                        </Link>
                        <button className="button-ghost" type="button" onClick={() => void onToggleArchive(permit)}>
                          {permit.archived ? "Restore" : "Archive"}
                        </button>
                        <button className="button-ghost" type="button" onClick={() => void onToggleDot(permit)}>
                          {permit.dotNotified ? "Clear DOT" : "Mark DOT"}
                        </button>
                        <button className="button-danger" type="button" onClick={() => void onDeletePermit(permit.id)}>
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
