"use client";

import { FormEvent, useState } from "react";
import type { Job } from "@/domain/jobs/types";
import { formatDate } from "@/lib/utils";

type JobEditorFormProps = {
  job?: Job | null;
  prefill?: Partial<Job>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void | Promise<void>;
  submitLabel?: string;
};

export function JobEditorForm({
  job,
  prefill,
  onSubmit,
  onCancel,
  onDelete,
  submitLabel,
}: JobEditorFormProps) {
  const initialAltParkingBlocked = job?.altParkingBlocked ?? prefill?.altParkingBlocked ?? false;
  const [altParkingBlocked, setAltParkingBlocked] = useState(initialAltParkingBlocked);

  return (
    <form className="form-grid" onSubmit={onSubmit}>
      <input name="id" type="hidden" value={job?.id ?? ""} />

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
        <input id="taskType" name="taskType" defaultValue={job?.taskType ?? prefill?.taskType ?? ""} />
      </div>
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
      <div className="field">
        <label htmlFor="permitNumber">Permit number</label>
        <input id="permitNumber" name="permitNumber" defaultValue={job?.permitNumber ?? prefill?.permitNumber ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="permitCode">Permit code</label>
        <input id="permitCode" name="permitCode" defaultValue={job?.permitCode ?? prefill?.permitCode ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="permitExpiry">Permit expiry</label>
        <input
          id="permitExpiry"
          name="permitExpiry"
          type="date"
          defaultValue={job?.permitExpiry ?? prefill?.permitExpiry ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="permitFiles">Permit documents</label>
        <input id="permitFiles" name="permitFiles" type="file" multiple />
      </div>

      {job?.permitDocUrls?.length ? (
        <div className="field" data-span="2">
          <label>Existing permit documents</label>
          <div className="stack">
            {job.permitDocUrls.map((item) => (
              <a key={item.url} className="muted" href={item.url} rel="noreferrer" target="_blank">
                {item.name || `Document ${formatDate(job.updatedAt)}`}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="field" data-span="2">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" defaultValue={job?.notes ?? prefill?.notes ?? ""} />
      </div>

      <div className="dialog-actions" style={{ gridColumn: "1 / -1" }}>
        <button className="button-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button" type="submit">
          {submitLabel ?? (job ? "Save changes" : "Create job")}
        </button>
      </div>
    </form>
  );
}
