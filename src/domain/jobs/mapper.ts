import { asAttachmentLinks, asBoolean, asCustomFields, asPermitChips, asString, timestampToIso } from "@/domain/common/legacy";
import type { Job } from "@/domain/jobs/types";

export function mapLegacyJob(id: string, raw: Record<string, unknown>): Job {
  const permits = asPermitChips(raw.permits);
  const permitNumber = asString(raw.permitNumber);
  const permitCode = asString(raw.permitCode);
  const permitExpiry = asString(raw.permitExpiry);

  return {
    id,
    customerName: asString(raw.customerName),
    phone: asString(raw.phone),
    email: asString(raw.email),
    invoiceNumber: asString(raw.invoiceNumber),
    address: asString(raw.address),
    taskType: asString(raw.taskType),
    projectSize: asString(raw.projectSize),
    jobType: asString(raw.jobType),
    concreteSub: asString(raw.concreteSub),
    altParkingBlocked: asBoolean(raw.altParkingBlocked),
    altParkingDays: asString(raw.altParkingDays),
    altParkingTime: asString(raw.altParkingTime),
    blocked: asString(raw.blocked),
    status: asString(raw.status) || "Pending",
    scheduleDay: asString(raw.scheduleDay),
    completionDay: asString(raw.completionDay),
    permits:
      permits.length > 0
        ? permits
        : permitNumber || permitCode
          ? [{ number: permitNumber, code: permitCode, expiry: permitExpiry }]
          : [],
    permitCode,
    permitNumber,
    permitExpiry,
    notes: asString(raw.notes),
    customFields: asCustomFields(raw.customFields),
    permitDocUrl: asString(raw.permitDocUrl),
    permitDocUrls: asAttachmentLinks(raw.permitDocUrls),
    createdBy: asString(raw.createdBy),
    createdAt: timestampToIso(raw.createdAt),
    updatedBy: asString(raw.updatedBy),
    updatedAt: timestampToIso(raw.updatedAt),
  };
}

export function jobStatusTone(status: string) {
  switch (status) {
    case "Completed":
      return "success";
    case "In Progress":
      return "warning";
    case "Cancelled":
      return "danger";
    default:
      return "default";
  }
}
