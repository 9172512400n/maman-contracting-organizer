import { asAttachmentLinks, asBoolean, asString, timestampToIso } from "@/domain/common/legacy";
import type { Permit } from "@/domain/permits/types";

export function mapLegacyPermit(id: string, raw: Record<string, unknown>): Permit {
  return {
    id,
    permitNumber: asString(raw.permitNumber),
    permitTypeCode: asString(raw.permitTypeCode),
    validFrom: asString(raw.validFrom),
    expirationDate: asString(raw.expirationDate),
    permitHolder: asString(raw.permitHolder),
    jobAddress: asString(raw.jobAddress),
    status: asString(raw.status) || "Pending",
    notes: asString(raw.notes),
    linkedJobId: asString(raw.linkedJobId),
    docUrl: asString(raw.docUrl),
    docUrls: asAttachmentLinks(raw.docUrls ?? raw.docUrl),
    dotNotified: asBoolean(raw.dotNotified),
    dotNotifiedDate: asString(raw.dotNotifiedDate),
    archived: asBoolean(raw.archived),
    createdBy: asString(raw.createdBy),
    createdAt: timestampToIso(raw.createdAt),
    updatedBy: asString(raw.updatedBy),
    updatedAt: asString(raw.updatedAt) || timestampToIso(raw.updatedAt),
  };
}
