"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  setPermitsDotNotified,
} from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";
import { formatDate } from "@/lib/utils";

type DotBureau = {
  id: string;
  name: string;
  email: string;
};

type DotDraft = {
  date: string;
  time: string;
  bureauIds: string[];
};

type PermitDialogDraft = {
  permitNumber?: string;
  permitTypeCode?: string;
  validFrom?: string;
  expirationDate?: string;
  permitHolder?: string;
  jobAddress?: string;
  status?: string;
  notes?: string;
  linkedJobId?: string;
};

const DOT_BUREAUS: DotBureau[] = [
  { id: "brooklyn", name: "Brooklyn BPP", email: "Brooklynbpp@dot.nyc.gov" },
  { id: "manhattan_hiqa", name: "Manhattan HIQA", email: "MNHIQA@dot.nyc.gov" },
  { id: "manhattan_bpp", name: "Manhattan BPP", email: "Manhattanbpp@dot.nyc.gov" },
  { id: "queens", name: "Queens BPP", email: "Queensbpp@dot.nyc.gov" },
  { id: "bronx", name: "Bronx BPP", email: "Bronxbpp@dot.nyc.gov" },
  { id: "staten_island", name: "Staten Island", email: "Sibpp@dot.nyc.gov" },
  { id: "construction", name: "DOT Construction", email: "ConstructionPermits@dot.nyc.gov" },
];

const DOT_PREFS_KEY = "dot_bureau_prefs";

function groupPermitsByAddress(permits: Permit[]) {
  return permits.reduce<Record<string, Permit[]>>((groups, permit) => {
    const key = permit.jobAddress || "No address";
    groups[key] = groups[key] ? [...groups[key], permit] : [permit];
    return groups;
  }, {});
}

function permitGroupKey(address: string) {
  return address.trim().toLowerCase() || "__no_address__";
}

function daysUntil(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function isPermitExpired(permit: Permit) {
  const remaining = daysUntil(permit.expirationDate);
  return remaining !== null && remaining < 0;
}

function formatDotDate(value: string) {
  if (!value) return value;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDotTime(value: string) {
  if (!value) return value;
  try {
    const [hourValue, minuteValue] = value.split(":");
    const hour = Number(hourValue);
    const minute = Number(minuteValue);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function detectBorough(address: string) {
  const normalized = address.toLowerCase();
  const zipMatch = normalized.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = zipMatch[1];
    if (zip.startsWith("112")) return "brooklyn";
    if (/^(113|114|116)/.test(zip)) return "queens";
    if (zip.startsWith("104")) return "bronx";
    if (zip.startsWith("103")) return "staten_island";
  }
  if (normalized.includes("brooklyn")) return "brooklyn";
  if (normalized.includes("queens")) return "queens";
  if (normalized.includes("bronx")) return "bronx";
  if (normalized.includes("staten island")) return "staten_island";
  if (normalized.includes("manhattan")) return "manhattan";
  return "manhattan";
}

function readSavedDotPrefs() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DOT_PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSavedDotPrefs(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DOT_PREFS_KEY, JSON.stringify(ids));
}

function defaultBureauIds(address: string) {
  const saved = readSavedDotPrefs();
  if (saved && saved.length > 0) {
    return saved;
  }

  const borough = detectBorough(address);
  if (borough === "manhattan") {
    return ["manhattan_hiqa", "manhattan_bpp"];
  }
  return [borough];
}

function permitStatusTone(status: string) {
  switch (status) {
    case "Approved":
    case "Issued":
    case "Active":
      return "success";
    case "Expired":
    case "Rejected":
    case "Cancelled":
      return "danger";
    case "Submitted":
    case "Under Review":
    case "Pending":
      return "warning";
    default:
      return "default";
  }
}

function expiryLabel(permit: Permit) {
  const remaining = daysUntil(permit.expirationDate);
  if (remaining === null) return null;
  if (remaining < 0) return { label: "Expired", tone: "danger" as const };
  if (remaining <= 4) return { label: `Expires in ${remaining}d`, tone: "danger" as const };
  if (remaining < 30) return { label: "Expiring soon", tone: "warning" as const };
  return null;
}

function findLinkedJobId(jobs: Job[], address: string) {
  const normalizedAddress = address.trim().toLowerCase();
  if (!normalizedAddress) {
    return "";
  }

  const exactMatch = jobs.find((job) => job.address.trim().toLowerCase() === normalizedAddress);
  return exactMatch?.id ?? "";
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
  const [selectedPermitIds, setSelectedPermitIds] = useState<Record<string, string[]>>({});
  const [dotDrafts, setDotDrafts] = useState<Record<string, DotDraft>>({});
  const [dialogDraft, setDialogDraft] = useState<PermitDialogDraft>({});
  const [stagedPermitFiles, setStagedPermitFiles] = useState<File[]>([]);
  const [dialogSeed, setDialogSeed] = useState(0);
  const [scanTargetAddress, setScanTargetAddress] = useState("");
  const scanInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    const groupKeys = Object.keys(activePermitGroups);
    setDotDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const address of groupKeys) {
        const key = permitGroupKey(address);
        if (!next[key]) {
          next[key] = {
            date: "",
            time: "",
            bureauIds: defaultBureauIds(address),
          };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [activePermitGroups]);

  async function onSavePermit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      stagedPermitFiles.forEach((file) => {
        formData.append("permitFiles", file);
      });
      await savePermit(formData, session);
      setDialogOpen(false);
      setEditingPermitId(null);
      setDialogDraft({});
      setStagedPermitFiles([]);
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

  function resetDialogState() {
    setDialogOpen(false);
    setEditingPermitId(null);
    setDialogDraft({});
    setStagedPermitFiles([]);
    setDialogSeed((current) => current + 1);
  }

  function openCreateDialog(draft?: PermitDialogDraft, files?: File[]) {
    const matchedLinkedJobId =
      draft?.linkedJobId || findLinkedJobId(jobs, draft?.jobAddress ?? "");
    setEditingPermitId(null);
    setDialogDraft({
      status: "Pending",
      ...draft,
      linkedJobId: matchedLinkedJobId,
    });
    setStagedPermitFiles(files ?? []);
    setDialogSeed((current) => current + 1);
    setDialogOpen(true);
  }

  function openEditDialog(id: string) {
    setEditingPermitId(id);
    setDialogDraft({});
    setStagedPermitFiles([]);
    setDialogSeed((current) => current + 1);
    setDialogOpen(true);
  }

  function toggleGroup(address: string) {
    setExpandedGroups((current) => ({
      ...current,
      [address]: !(current[address] ?? true),
    }));
  }

  function updatePermitSelection(address: string, permitId: string, checked: boolean) {
    const key = permitGroupKey(address);
    setSelectedPermitIds((current) => {
      const existing = current[key] ?? [];
      const next = checked
        ? Array.from(new Set([...existing, permitId]))
        : existing.filter((item) => item !== permitId);
      return {
        ...current,
        [key]: next,
      };
    });
  }

  function updateDotDraft(address: string, patch: Partial<DotDraft>) {
    const key = permitGroupKey(address);
    setDotDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {
          date: "",
          time: "",
          bureauIds: defaultBureauIds(address),
        }),
        ...patch,
      },
    }));
  }

  function toggleBureau(address: string, bureauId: string) {
    const key = permitGroupKey(address);
    setDotDrafts((current) => {
      const existing = current[key] ?? { date: "", time: "", bureauIds: defaultBureauIds(address) };
      const nextIds = existing.bureauIds.includes(bureauId)
        ? existing.bureauIds.filter((item) => item !== bureauId)
        : [...existing.bureauIds, bureauId];
      writeSavedDotPrefs(nextIds);
      return {
        ...current,
        [key]: {
          ...existing,
          bureauIds: nextIds,
        },
      };
    });
  }

  function resetBureauDefaults(address: string) {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DOT_PREFS_KEY);
    }
    updateDotDraft(address, {
      bureauIds: defaultBureauIds(address),
    });
  }

  function onStartScan(address: string) {
    setScanTargetAddress(address);
    scanInputRef.current?.click();
  }

  function onScannedFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) {
      return;
    }

    openCreateDialog(
      {
        jobAddress: scanTargetAddress,
      },
      files,
    );
  }

  async function onNotifyDot(address: string, groupPermits: Permit[]) {
    const key = permitGroupKey(address);
    const selectedIds = selectedPermitIds[key] ?? [];
    const selectedPermits = groupPermits.filter((permit) => selectedIds.includes(permit.id));
    const dotDraft = dotDrafts[key] ?? { date: "", time: "", bureauIds: defaultBureauIds(address) };
    const chosenBureaus = DOT_BUREAUS.filter((bureau) => dotDraft.bureauIds.includes(bureau.id));

    if (!selectedPermits.length) {
      setError("Select at least one permit before notifying DOT.");
      return;
    }
    if (!dotDraft.date || !dotDraft.time || chosenBureaus.length === 0) {
      setError("Choose the inspection day, time, and at least one bureau.");
      return;
    }
    if (selectedPermits.some((permit) => isPermitExpired(permit))) {
      setError("One or more selected permits are expired. Upload a renewal before notifying DOT.");
      return;
    }

    const permitNumbers = selectedPermits
      .map((permit) => permit.permitNumber)
      .filter(Boolean);
    const permitHolder = selectedPermits.find((permit) => permit.permitHolder)?.permitHolder ?? "";
    const recipients = chosenBureaus.map((bureau) => bureau.email).join(",");
    const subject = encodeURIComponent(`${address}#${permitNumbers.map((item) => item.trim()).join(", #")}`);
    const body = encodeURIComponent(
      `Hi,\n\nPlease Schedule milling inspection for the above mentioned location\n\nDay: ${formatDotDate(dotDraft.date)}\nTime: ${formatDotTime(dotDraft.time)}\n\nPermit holder: ${permitHolder}\nPermit Number: ${permitNumbers.map((item) => `#${item}`).join(", ")}\n\nMy contact information is below\nThank you\nNir Maman\nCell: 917-251-2400\nCell: 516-306-3326`,
    );

    setError(null);
    if (typeof window !== "undefined") {
      window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}&bcc=${encodeURIComponent("nir@mamancontracting.com")}`;
    }

    try {
      await setPermitsDotNotified(
        selectedPermits.map((permit) => permit.id),
        true,
      );
      await loadPermitsPage();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update DOT status.");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Permits</p>
          <h1>Permit management</h1>
          <p className="muted">Grouped by address, with per-location DOT notification and permit actions restored.</p>
        </div>
        <button className="button" type="button" onClick={() => openCreateDialog()}>
          + Add permit
        </button>
      </div>

      {error ? <div className="callout">{error}</div> : null}

      <SectionCard title="Permits" description="Search by address or permit #, then expand a location group.">
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
                const groupKey = permitGroupKey(address);
                const expanded = expandedGroups[address] ?? true;
                const dotDraft = dotDrafts[groupKey] ?? {
                  date: "",
                  time: "",
                  bureauIds: defaultBureauIds(address),
                };
                const selectedIds = selectedPermitIds[groupKey] ?? [];
                const selectedPermits = groupPermits.filter((permit) => selectedIds.includes(permit.id));
                const hasExpiredSelection = selectedPermits.some((permit) => isPermitExpired(permit));
                const canNotify =
                  selectedPermits.length > 0 &&
                  Boolean(dotDraft.date) &&
                  Boolean(dotDraft.time) &&
                  dotDraft.bureauIds.length > 0 &&
                  !hasExpiredSelection;

                return (
                  <div className="group-card permit-group-card" key={address}>
                    <button className="group-card-toggle" type="button" onClick={() => toggleGroup(address)}>
                      <div className="inline-meta">
                        <strong>{address}</strong>
                        {groupPermits.some((permit) => permit.dotNotified) ? (
                          <StatusPill label="DOT notified" tone="success" />
                        ) : null}
                      </div>
                      <div className="inline-meta">
                        <span className="pill" data-tone="default">
                          {groupPermits.length} permit{groupPermits.length === 1 ? "" : "s"}
                        </span>
                        <span className="muted">{expanded ? "Hide" : "Show"}</span>
                      </div>
                    </button>

                    {expanded ? (
                      <div className="stack permit-group-body">
                        {groupPermits.map((permit) => {
                          const expiryState = expiryLabel(permit);
                          return (
                            <div className="record-card permit-record-card" key={permit.id}>
                              <div className="record-header">
                                <div className="stack" style={{ flex: 1 }}>
                                  <label className="checkbox-field permit-select-row">
                                    <input
                                      checked={selectedIds.includes(permit.id)}
                                      type="checkbox"
                                      onChange={(event) =>
                                        updatePermitSelection(address, permit.id, event.target.checked)
                                      }
                                    />
                                    <span>#{permit.permitNumber || "Untitled permit"}</span>
                                  </label>
                                  <div className="inline-meta">
                                    {permit.permitHolder ? <span className="muted">{permit.permitHolder}</span> : null}
                                    {permit.permitTypeCode ? <span className="muted">{permit.permitTypeCode}</span> : null}
                                    {permit.linkedJobId ? <span className="muted">Linked job: {permit.linkedJobId}</span> : null}
                                  </div>
                                </div>
                                <div className="actions-row">
                                  <StatusPill label={permit.status || "Pending"} tone={permitStatusTone(permit.status)} />
                                  {expiryState ? <StatusPill label={expiryState.label} tone={expiryState.tone} /> : null}
                                  {permit.dotNotified ? <StatusPill label="DOT notified" tone="success" /> : null}
                                </div>
                              </div>

                              <div className="record-meta-grid">
                                <span className="muted">Valid: {formatDate(permit.validFrom)}</span>
                                <span className="muted">Expires: {formatDate(permit.expirationDate)}</span>
                                <span className="muted">Address: {permit.jobAddress || "—"}</span>
                                <span className="muted">
                                  DOT status: {permit.dotNotified ? `Sent ${formatDate(permit.dotNotifiedDate)}` : "Pending"}
                                </span>
                              </div>

                              <div className="permit-doc-block">
                                <div className="permit-doc-header">
                                  <strong>Permit document</strong>
                                </div>
                                {permit.docUrls.length ? (
                                  <div className="stack">
                                    {permit.docUrls.map((item) => (
                                      <a key={item.url} className="muted" href={item.url} rel="noreferrer" target="_blank">
                                        {item.name}
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="muted">No document uploaded yet.</p>
                                )}
                              </div>

                              {permit.notes ? <p className="muted">{permit.notes}</p> : null}

                              <div className="actions-row">
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
                          );
                        })}

                        <div className="permit-group-actions">
                          <button
                            className="button"
                            type="button"
                            onClick={() =>
                              openCreateDialog({
                                jobAddress: address,
                                linkedJobId: findLinkedJobId(jobs, address),
                              })
                            }
                          >
                            + Add permit
                          </button>
                          <button className="button-secondary" type="button" onClick={() => onStartScan(address)}>
                            Scan permit
                          </button>
                        </div>

                        <div className="permit-dot-panel">
                          <div className="section-head" style={{ marginBottom: 0 }}>
                            <div className="section-title">
                              <h2>DOT Milling Inspection Notification</h2>
                              <p className="muted">
                                Select permits, set the inspection day and time, then choose the bureau recipients.
                              </p>
                            </div>
                            <button className="button-ghost" type="button" onClick={() => resetBureauDefaults(address)}>
                              Reset default
                            </button>
                          </div>

                          <div className="form-grid permit-dot-grid">
                            <div className="field">
                              <label htmlFor={`dot-date-${groupKey}`}>Day</label>
                              <input
                                id={`dot-date-${groupKey}`}
                                type="date"
                                value={dotDraft.date}
                                onChange={(event) => updateDotDraft(address, { date: event.target.value })}
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`dot-time-${groupKey}`}>Time</label>
                              <input
                                id={`dot-time-${groupKey}`}
                                step={900}
                                type="time"
                                value={dotDraft.time}
                                onChange={(event) => updateDotDraft(address, { time: event.target.value })}
                              />
                            </div>
                            <div className="field" data-span="2">
                              <label>Select bureau(s)</label>
                              <div className="permit-bureau-list">
                                {DOT_BUREAUS.map((bureau) => {
                                  const checked = dotDraft.bureauIds.includes(bureau.id);
                                  return (
                                    <label
                                      key={bureau.id}
                                      className="permit-bureau-item"
                                      data-selected={checked}
                                    >
                                      <input
                                        checked={checked}
                                        type="checkbox"
                                        onChange={() => toggleBureau(address, bureau.id)}
                                      />
                                      <span>{bureau.name}</span>
                                      <small>{bureau.email}</small>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {hasExpiredSelection ? (
                            <div className="callout">
                              One or more selected permits are expired. Upload a renewal before notifying DOT.
                            </div>
                          ) : null}

                          <div className="actions-row">
                            <button
                              className="button-secondary"
                              disabled={!canNotify}
                              type="button"
                              onClick={() => void onNotifyDot(address, groupPermits)}
                            >
                              Notify DOT
                            </button>
                            <span className="muted">
                              {selectedPermits.length
                                ? `${selectedPermits.length} permit${selectedPermits.length === 1 ? "" : "s"} selected`
                                : "Select one or more permits above"}
                            </span>
                          </div>
                        </div>
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

      <input
        ref={scanInputRef}
        accept="image/*,application/pdf"
        hidden
        multiple
        type="file"
        onChange={onScannedFiles}
      />

      <Dialog
        open={dialogOpen}
        title={currentPermit ? "Edit permit" : "Add permit"}
        description="Writes to the same legacy `permits` collection."
        onClose={resetDialogState}
      >
        <form
          key={currentPermit?.id ?? `draft-${dialogSeed}`}
          className="form-grid"
          onSubmit={onSavePermit}
        >
          <input name="id" type="hidden" value={currentPermit?.id ?? ""} />
          <div className="field">
            <label htmlFor="permitNumber">Permit number</label>
            <input
              id="permitNumber"
              name="permitNumber"
              defaultValue={currentPermit?.permitNumber ?? dialogDraft.permitNumber ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="permitTypeCode">Permit type code</label>
            <input
              id="permitTypeCode"
              name="permitTypeCode"
              defaultValue={currentPermit?.permitTypeCode ?? dialogDraft.permitTypeCode ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="validFrom">Valid from</label>
            <input
              id="validFrom"
              name="validFrom"
              type="date"
              defaultValue={currentPermit?.validFrom ?? dialogDraft.validFrom ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="expirationDate">Expiration</label>
            <input
              id="expirationDate"
              name="expirationDate"
              type="date"
              defaultValue={currentPermit?.expirationDate ?? dialogDraft.expirationDate ?? ""}
            />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="permitHolder">Permit holder</label>
            <input
              id="permitHolder"
              name="permitHolder"
              defaultValue={currentPermit?.permitHolder ?? dialogDraft.permitHolder ?? ""}
            />
          </div>
          <div className="field" data-span="2">
            <label htmlFor="jobAddress">Job address</label>
            <input
              id="jobAddress"
              name="jobAddress"
              defaultValue={currentPermit?.jobAddress ?? dialogDraft.jobAddress ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="linkedJobId">Linked job</label>
            <select
              id="linkedJobId"
              name="linkedJobId"
              defaultValue={
                currentPermit?.linkedJobId ??
                dialogDraft.linkedJobId ??
                findLinkedJobId(jobs, dialogDraft.jobAddress ?? "")
              }
            >
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
            <select id="status" name="status" defaultValue={currentPermit?.status ?? dialogDraft.status ?? "Pending"}>
              <option value="Pending">Pending</option>
              <option value="Submitted">Submitted</option>
              <option value="Under Review">Under Review</option>
              <option value="Approved">Approved</option>
              <option value="Issued">Issued</option>
              <option value="Active">Active</option>
              <option value="Expired">Expired</option>
              <option value="Rejected">Rejected</option>
              <option value="On Hold">On Hold</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="permitFiles">Documents</label>
            <input id="permitFiles" name="permitFiles" type="file" multiple />
          </div>

          {stagedPermitFiles.length ? (
            <div className="field" data-span="2">
              <label>Scanned files ready to upload</label>
              <div className="stack">
                {stagedPermitFiles.map((file) => (
                  <span className="muted" key={`${file.name}-${file.size}`}>
                    {file.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {currentPermit?.docUrls.length ? (
            <div className="field" data-span="2">
              <label>Existing permit documents</label>
              <div className="stack">
                {currentPermit.docUrls.map((item) => (
                  <a key={item.url} className="muted" href={item.url} rel="noreferrer" target="_blank">
                    {item.name}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <div className="field" data-span="2">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" defaultValue={currentPermit?.notes ?? dialogDraft.notes ?? ""} />
          </div>
          <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
            <button className="button-ghost" type="button" onClick={resetDialogState}>
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
