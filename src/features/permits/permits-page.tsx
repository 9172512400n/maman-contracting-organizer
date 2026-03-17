"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { Job } from "@/domain/jobs/types";
import type { Permit } from "@/domain/permits/types";
import {
  deletePermit,
  listJobs,
  listPermits,
  savePermit,
  setPermitArchived,
  setPermitDotNotified,
} from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import { formatDate } from "@/lib/utils";

function groupPermitsByAddress(permits: Permit[]) {
  return permits.reduce<Record<string, Permit[]>>((groups, permit) => {
    const key = permit.jobAddress || "No address";
    groups[key] = groups[key] ? [...groups[key], permit] : [permit];
    return groups;
  }, {});
}

export default function PermitsPage() {
  const { session } = useAuth();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPermitId, setEditingPermitId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

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

  const currentPermit = permits.find((item) => item.id === editingPermitId) ?? null;
  const filteredPermits = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return permits.filter((permit) =>
      !needle ||
      [permit.jobAddress, permit.permitNumber, permit.permitHolder, permit.permitTypeCode]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [permits, search]);

  const activePermitGroups = useMemo(
    () => groupPermitsByAddress(filteredPermits.filter((permit) => !permit.archived)),
    [filteredPermits],
  );
  const archivedPermits = useMemo(
    () => filteredPermits.filter((permit) => permit.archived),
    [filteredPermits],
  );

  async function onSavePermit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      await savePermit(new FormData(event.currentTarget), session);
      setDialogOpen(false);
      setEditingPermitId(null);
      await loadPermitsPage();
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
      if (editingPermitId === id) {
        setEditingPermitId(null);
        setDialogOpen(false);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not delete permit.");
    }
  }

  function openCreateDialog() {
    setEditingPermitId(null);
    setDialogOpen(true);
  }

  function openEditDialog(id: string) {
    setEditingPermitId(id);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Permits</p>
          <h1>Permit management</h1>
          <p className="muted">Grouped by address, with archived permits split out like the legacy view.</p>
        </div>
        <button className="button" type="button" onClick={openCreateDialog}>
          + Add permit
        </button>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title="Permits" description="Search by address or permit number, then expand a location group.">
        <div className="stack">
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by address or permit #..."
          />

          {loading ? (
            <p className="muted">Loading permits...</p>
          ) : Object.keys(activePermitGroups).length === 0 ? (
            <EmptyState title="No permits found" description="Try a different search or add a permit." />
          ) : (
            <div className="stack">
              {Object.entries(activePermitGroups).map(([address, groupPermits]) => {
                const expanded = expandedGroups[address] ?? true;
                return (
                  <div className="group-card" key={address}>
                    <button
                      className="group-card-toggle"
                      type="button"
                      onClick={() =>
                        setExpandedGroups((current) => ({
                          ...current,
                          [address]: !expanded,
                        }))
                      }
                    >
                      <div className="inline-meta">
                        <strong>{address}</strong>
                      </div>
                      <div className="inline-meta">
                        <span className="pill" data-tone="default">
                          {groupPermits.length} permit{groupPermits.length === 1 ? "" : "s"}
                        </span>
                        <span className="muted">{expanded ? "Hide" : "Show"}</span>
                      </div>
                    </button>

                    {expanded ? (
                      <div className="stack" style={{ marginTop: 12 }}>
                        {groupPermits.map((permit) => (
                          <div className="record-card" key={permit.id}>
                            <div className="record-header">
                              <div className="stack">
                                <strong>{permit.permitNumber || "Untitled permit"}</strong>
                                <div className="inline-meta">
                                  {permit.permitHolder ? <span className="muted">{permit.permitHolder}</span> : null}
                                  {permit.permitTypeCode ? <span className="muted">{permit.permitTypeCode}</span> : null}
                                </div>
                              </div>
                              <div className="actions-row">
                                <StatusPill label={permit.status || "Unknown"} tone="info" />
                                {permit.dotNotified ? <StatusPill label="DOT notified" tone="success" /> : null}
                              </div>
                            </div>

                            <div className="record-meta-grid">
                              <span className="muted">Valid: {formatDate(permit.validFrom)}</span>
                              <span className="muted">Expires: {formatDate(permit.expirationDate)}</span>
                              <span className="muted">Linked job: {permit.linkedJobId || "—"}</span>
                              <span className="muted">DOT: {permit.dotNotified ? "Notified" : "Pending"}</span>
                            </div>

                            {permit.docUrls.length ? (
                              <div className="stack" style={{ marginTop: 12 }}>
                                {permit.docUrls.map((item) => (
                                  <a key={item.url} className="muted" href={item.url} target="_blank" rel="noreferrer">
                                    {item.name}
                                  </a>
                                ))}
                              </div>
                            ) : null}

                            <div className="actions-row" style={{ marginTop: 12 }}>
                              <button className="button-ghost" type="button" onClick={() => openEditDialog(permit.id)}>
                                Edit
                              </button>
                              <button className="button-ghost" type="button" onClick={() => void onToggleDot(permit)}>
                                {permit.dotNotified ? "Clear DOT" : "Mark DOT"}
                              </button>
                              <button className="button-ghost" type="button" onClick={() => void onToggleArchive(permit)}>
                                Archive
                              </button>
                              <button className="button-danger" type="button" onClick={() => void onDeletePermit(permit.id)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Archived permits">
        {loading ? (
          <p className="muted">Loading archived permits...</p>
        ) : archivedPermits.length === 0 ? (
          <EmptyState title="No archived permits yet." description="Archived permits will show here." />
        ) : (
          <div className="stack">
            {archivedPermits.map((permit) => (
              <div className="record-card" key={permit.id}>
                <div className="record-header">
                  <div className="stack">
                    <strong>{permit.jobAddress || "No address"}</strong>
                    <span className="muted">{permit.permitNumber || "Untitled permit"}</span>
                  </div>
                  <div className="actions-row">
                    <StatusPill label="Archived" tone="default" />
                    <button className="button-ghost" type="button" onClick={() => void onToggleArchive(permit)}>
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog
        open={dialogOpen}
        title={currentPermit ? "Edit permit" : "Add permit"}
        description="Writes to the same legacy `permits` collection."
        onClose={() => {
          setDialogOpen(false);
          setEditingPermitId(null);
        }}
      >
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
          <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              className="button-ghost"
              type="button"
              onClick={() => {
                setDialogOpen(false);
                setEditingPermitId(null);
              }}
            >
              Cancel
            </button>
            <button className="button" type="submit">
              {currentPermit ? "Save changes" : "Create permit"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
