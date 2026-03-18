"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { AttachmentLink, CustomField, PermitChip } from "@/domain/common/types";
import type { Job } from "@/domain/jobs/types";
import { formatDate } from "@/lib/utils";

const KNOWN_TASK_TYPES = ["Parking Lot", "Sidewalk", "Custom"] as const;

type JobEditorFormProps = {
  job?: Job | null;
  prefill?: Partial<Job>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void | Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
  focusField?: "scheduleDay" | null;
};

function buildInitialPermitRows(job?: Job | null, prefill?: Partial<Job>) {
  const rows = job?.permits?.length
    ? job.permits
    : prefill?.permits?.length
      ? prefill.permits
      : job?.permitNumber || job?.permitCode || job?.permitExpiry
        ? [{ number: job?.permitNumber ?? "", code: job?.permitCode ?? "", expiry: job?.permitExpiry ?? "" }]
        : prefill?.permitNumber || prefill?.permitCode || prefill?.permitExpiry
          ? [
              {
                number: prefill?.permitNumber ?? "",
                code: prefill?.permitCode ?? "",
                expiry: prefill?.permitExpiry ?? "",
              },
            ]
          : [];

  return rows.length > 0
    ? rows.map((row) => ({
        number: row.number || row.code,
        code: "",
        expiry: "",
      }))
    : [{ number: "", code: "", expiry: "" }];
}

function buildInitialCustomFields(job?: Job | null, prefill?: Partial<Job>) {
  const rows = job?.customFields?.length
    ? job.customFields
    : prefill?.customFields?.length
      ? prefill.customFields
      : [];
  return rows.length > 0 ? rows : [{ label: "", value: "" }];
}

function attachmentFileLabel(count: number, singular: string, plural = `${singular}s`) {
  if (!count) {
    return "";
  }
  return `${count} ${count === 1 ? singular : plural} selected`;
}

function ExistingAttachmentList({
  title,
  items,
}: {
  title: string;
  items: AttachmentLink[];
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="field" data-span="2">
      <label>{title}</label>
      <div className="stack">
        {items.map((item, index) => (
          <a key={`${item.url}-${index}`} className="muted" href={item.url} rel="noreferrer" target="_blank">
            {item.name || `Attachment ${index + 1}`}
          </a>
        ))}
      </div>
    </div>
  );
}

export function JobEditorForm({
  job,
  prefill,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel,
  isSubmitting,
  focusField,
}: JobEditorFormProps) {
  const initialTaskType = job?.taskType ?? prefill?.taskType ?? "";
  const initialAltParkingBlocked = job?.altParkingBlocked ?? prefill?.altParkingBlocked ?? false;
  const [taskTypeSelection, setTaskTypeSelection] = useState<string>(
    KNOWN_TASK_TYPES.includes(initialTaskType as (typeof KNOWN_TASK_TYPES)[number])
      ? initialTaskType
      : initialTaskType
        ? "Custom"
        : "",
  );
  const [customTaskType, setCustomTaskType] = useState(
    KNOWN_TASK_TYPES.includes(initialTaskType as (typeof KNOWN_TASK_TYPES)[number]) ? "" : initialTaskType,
  );
  const [altParkingBlocked, setAltParkingBlocked] = useState(initialAltParkingBlocked);
  const [permitRows, setPermitRows] = useState<PermitChip[]>(() => buildInitialPermitRows(job, prefill));
  const [customFields, setCustomFields] = useState<CustomField[]>(() => buildInitialCustomFields(job, prefill));
  const [permitFilesLabel, setPermitFilesLabel] = useState("");
  const [completionPhotosLabel, setCompletionPhotosLabel] = useState("");
  const [receiptFilesLabel, setReceiptFilesLabel] = useState("");

  const serializedPermits = useMemo(
    () =>
      JSON.stringify(
        permitRows.filter((row) => row.number.trim() || row.code.trim() || row.expiry.trim()),
      ),
    [permitRows],
  );
  const serializedCustomFields = useMemo(
    () =>
      JSON.stringify(
        customFields.filter((field) => field.label.trim() || field.value.trim()),
      ),
    [customFields],
  );
  const firstPermit = permitRows.find((row) => row.number.trim() || row.code.trim() || row.expiry.trim()) ?? {
    number: "",
    code: "",
    expiry: "",
  };

  useEffect(() => {
    if (!focusField) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const input = document.getElementById(focusField) as HTMLInputElement | null;
      if (!input) {
        return;
      }
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
      input.select?.();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusField]);

  function updatePermitRow(index: number, patch: Partial<PermitChip>) {
    setPermitRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  function addPermitRow() {
    setPermitRows((current) => [...current, { number: "", code: "", expiry: "" }]);
  }

  function removePermitRow(index: number) {
    setPermitRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [{ number: "", code: "", expiry: "" }];
    });
  }

  function updateCustomField(index: number, patch: Partial<CustomField>) {
    setCustomFields((current) =>
      current.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)),
    );
  }

  function addCustomField() {
    setCustomFields((current) => [...current, { label: "", value: "" }]);
  }

  function removeCustomField(index: number) {
    setCustomFields((current) => {
      const next = current.filter((_, fieldIndex) => fieldIndex !== index);
      return next.length > 0 ? next : [{ label: "", value: "" }];
    });
  }

  function onFilesPicked(
    event: ChangeEvent<HTMLInputElement>,
    kind: "permit" | "photos" | "receipts",
  ) {
    const files = Array.from(event.target.files ?? []);
    const label =
      kind === "permit"
        ? attachmentFileLabel(files.length, "permit document")
        : kind === "photos"
          ? attachmentFileLabel(files.length, "completion photo")
          : attachmentFileLabel(files.length, "receipt");

    if (kind === "permit") {
      setPermitFilesLabel(label);
      return;
    }
    if (kind === "photos") {
      setCompletionPhotosLabel(label);
      return;
    }
    setReceiptFilesLabel(label);
  }

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <input name="id" type="hidden" value={job?.id ?? ""} />
      <input name="permitsJson" type="hidden" value={serializedPermits} />
      <input name="customFieldsJson" type="hidden" value={serializedCustomFields} />
      <input
        name="resolvedTaskType"
        type="hidden"
        value={taskTypeSelection === "Custom" ? customTaskType : taskTypeSelection}
      />
      <input name="permitNumber" type="hidden" value={firstPermit.number} />
      <input name="permitCode" type="hidden" value={firstPermit.code} />
      <input name="permitExpiry" type="hidden" value={firstPermit.expiry} />

      {job && onDelete ? (
        <div className="dialog-inline-actions" style={{ gridColumn: "1 / -1" }}>
          <button className="button-danger" type="button" onClick={() => void onDelete()}>
            Delete
          </button>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="customerName">Customer name</label>
        <input id="customerName" name="customerName" defaultValue={job?.customerName ?? prefill?.customerName ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone number</label>
        <input id="phone" name="phone" defaultValue={job?.phone ?? prefill?.phone ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" defaultValue={job?.email ?? prefill?.email ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="invoiceNumber">Invoice / estimate #</label>
        <input
          id="invoiceNumber"
          name="invoiceNumber"
          defaultValue={job?.invoiceNumber ?? prefill?.invoiceNumber ?? ""}
        />
      </div>
      <div className="field" data-span="2">
        <label htmlFor="address">Job address</label>
        <input id="address" name="address" defaultValue={job?.address ?? prefill?.address ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="taskType">Task type</label>
        <select
          id="taskType"
          name="taskType"
          value={taskTypeSelection}
          onChange={(event) => setTaskTypeSelection(event.target.value)}
        >
          <option value="">Select task type...</option>
          <option value="Parking Lot">Parking Lot</option>
          <option value="Sidewalk">Sidewalk</option>
          <option value="Custom">Custom</option>
        </select>
      </div>
      {taskTypeSelection === "Custom" ? (
        <div className="field">
          <label htmlFor="customTaskType">Custom task type</label>
          <input
            id="customTaskType"
            name="customTaskType"
            value={customTaskType}
            onChange={(event) => setCustomTaskType(event.target.value)}
            placeholder="e.g. Driveway, Roof Repair..."
          />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="projectSize">Project size</label>
        <input id="projectSize" name="projectSize" defaultValue={job?.projectSize ?? prefill?.projectSize ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="jobType">Job type (crew)</label>
        <select id="jobType" name="jobType" defaultValue={job?.jobType ?? prefill?.jobType ?? ""}>
          <option value="">None</option>
          <option value="Asphalt">Asphalt</option>
          <option value="Concrete">Concrete</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="concreteSub">Concrete sub</label>
        <input id="concreteSub" name="concreteSub" defaultValue={job?.concreteSub ?? prefill?.concreteSub ?? ""} />
      </div>
      <div className="field" data-span="2">
        <label className="checkbox-field">
          <input
            name="altParkingBlocked"
            type="checkbox"
            defaultChecked={initialAltParkingBlocked}
            onChange={(event) => setAltParkingBlocked(event.target.checked)}
          />
          <span>Fully blocked off</span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="altParkingDays">Alternate side parking days</label>
        <input
          id="altParkingDays"
          name="altParkingDays"
          defaultValue={job?.altParkingDays ?? prefill?.altParkingDays ?? ""}
          disabled={altParkingBlocked}
        />
      </div>
      <div className="field">
        <label htmlFor="altParkingTime">Parking time</label>
        <input
          id="altParkingTime"
          name="altParkingTime"
          defaultValue={job?.altParkingTime ?? prefill?.altParkingTime ?? ""}
          disabled={altParkingBlocked}
        />
      </div>
      <div className="field">
        <label htmlFor="blocked">Job blocked?</label>
        <select id="blocked" name="blocked" defaultValue={job?.blocked ?? prefill?.blocked ?? "no"}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="status">Job status</label>
        <select id="status" name="status" defaultValue={job?.status ?? prefill?.status ?? "Pending"}>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Blocked">Blocked</option>
          <option value="On Hold">On Hold</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="scheduleDay">Schedule day</label>
        <input id="scheduleDay" name="scheduleDay" type="date" defaultValue={job?.scheduleDay ?? prefill?.scheduleDay ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="completionDay">Completion day</label>
        <input
          id="completionDay"
          name="completionDay"
          type="date"
          defaultValue={job?.completionDay ?? prefill?.completionDay ?? ""}
        />
      </div>

      <div className="field" data-span="2">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div className="section-title">
            <label style={{ color: "var(--muted)" }}>Permits</label>
          </div>
          <button className="button-ghost" type="button" onClick={addPermitRow}>
            + Add permit
          </button>
        </div>
        <div className="stack">
          {permitRows.map((row, index) => (
            <div className="inline-list-card" key={`${index}-${row.number}-${row.code}-${row.expiry}`}>
              <div className="form-grid inline-list-grid">
                <div className="field">
                  <label htmlFor={`permit-row-number-${index}`}>Permit number</label>
                  <input
                    id={`permit-row-number-${index}`}
                    value={row.number}
                    onChange={(event) => updatePermitRow(index, { number: event.target.value, code: "", expiry: "" })}
                    placeholder="Enter permit number..."
                  />
                </div>
                <div className="field inline-list-action">
                  <button className="button-danger" type="button" onClick={() => removePermitRow(index)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="field" data-span="2">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" defaultValue={job?.notes ?? prefill?.notes ?? ""} />
      </div>

      <div className="upload-card" data-span="2">
        <div className="upload-card-title">Permit Documents (multiple allowed)</div>
        <label className="upload-dropzone">
          <input hidden id="permitFiles" name="permitFiles" multiple type="file" onChange={(event) => onFilesPicked(event, "permit")} />
          <span>Tap to upload permit documents — multiple files OK</span>
        </label>
        {permitFilesLabel ? <p className="muted">{permitFilesLabel}</p> : null}
        <ExistingAttachmentList title="Existing permit documents" items={job?.permitDocUrls ?? []} />
      </div>

      <div className="upload-card" data-span="2">
        <div className="upload-card-title">Job Completion Photos</div>
        <label className="upload-dropzone">
          <input
            hidden
            id="completionPhotoFiles"
            accept="image/*"
            name="completionPhotoFiles"
            multiple
            type="file"
            onChange={(event) => onFilesPicked(event, "photos")}
          />
          <span>Click to upload photos (multiple allowed)</span>
        </label>
        {completionPhotosLabel ? <p className="muted">{completionPhotosLabel}</p> : null}
        <ExistingAttachmentList title="Existing completion photos" items={job?.completionPhotoUrls ?? []} />
      </div>

      <div className="upload-card" data-span="2">
        <div className="upload-card-title">Material Receipts</div>
        <label className="upload-dropzone">
          <input
            hidden
            id="materialReceiptFiles"
            accept=".pdf,image/*"
            name="materialReceiptFiles"
            multiple
            type="file"
            onChange={(event) => onFilesPicked(event, "receipts")}
          />
          <span>Click to upload receipts (multiple allowed)</span>
        </label>
        {receiptFilesLabel ? <p className="muted">{receiptFilesLabel}</p> : null}
        <ExistingAttachmentList title="Existing material receipts" items={job?.materialReceiptUrls ?? []} />
      </div>

      <div className="field" data-span="2">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div className="section-title">
            <label style={{ color: "var(--muted)" }}>Custom fields</label>
          </div>
          <button className="button-ghost" type="button" onClick={addCustomField}>
            + Add custom field
          </button>
        </div>
        <div className="stack">
          {customFields.map((field, index) => (
            <div className="inline-list-card" key={`${index}-${field.label}-${field.value}`}>
              <div className="form-grid inline-list-grid">
                <div className="field">
                  <label htmlFor={`custom-field-label-${index}`}>Label</label>
                  <input
                    id={`custom-field-label-${index}`}
                    value={field.label}
                    onChange={(event) => updateCustomField(index, { label: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`custom-field-value-${index}`}>Value</label>
                  <input
                    id={`custom-field-value-${index}`}
                    value={field.value}
                    onChange={(event) => updateCustomField(index, { value: event.target.value })}
                  />
                </div>
                <div className="field inline-list-action">
                  <button className="button-danger" type="button" onClick={() => removeCustomField(index)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {job?.updatedAt ? (
        <div className="field" data-span="2">
          <span className="muted">Last updated {formatDate(job.updatedAt)}</span>
        </div>
      ) : null}

      <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
        <button className="button-ghost" disabled={isSubmitting} type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button" disabled={isSubmitting} type="submit">
          {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
          {submitLabel ?? (job ? "Update job" : "Save job")}
        </button>
      </div>
    </form>
  );
}
