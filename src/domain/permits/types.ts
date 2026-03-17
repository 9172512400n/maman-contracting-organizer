import type { AttachmentLink } from "@/domain/common/types";

export type Permit = {
  id: string;
  permitNumber: string;
  permitTypeCode: string;
  validFrom: string;
  expirationDate: string;
  permitHolder: string;
  jobAddress: string;
  status: string;
  notes: string;
  linkedJobId: string;
  docUrl: string;
  docUrls: AttachmentLink[];
  dotNotified: boolean;
  dotNotifiedDate: string;
  archived: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type PermitUpsertInput = Omit<
  Permit,
  "id" | "docUrl" | "docUrls" | "dotNotified" | "dotNotifiedDate" | "archived" | "createdBy" | "createdAt" | "updatedBy" | "updatedAt"
> & {
  id?: string;
};
