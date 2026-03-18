import type { AttachmentLink, CustomField, PermitChip } from "@/domain/common/types";

export type JobStatus =
  | "Pending"
  | "In Progress"
  | "Completed"
  | "On Hold"
  | "Cancelled"
  | string;

export type Job = {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  invoiceNumber: string;
  address: string;
  taskType: string;
  projectSize: string;
  jobType: string;
  concreteSub: string;
  altParkingBlocked: boolean;
  altParkingDays: string;
  altParkingTime: string;
  blocked: string;
  status: JobStatus;
  scheduleDay: string;
  completionDay: string;
  permits: PermitChip[];
  permitCode: string;
  permitNumber: string;
  permitExpiry: string;
  notes: string;
  customFields: CustomField[];
  permitDocUrl: string;
  permitDocUrls: AttachmentLink[];
  completionPhotoUrls: AttachmentLink[];
  materialReceiptUrls: AttachmentLink[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type JobUpsertInput = Omit<
  Job,
  | "id"
  | "permits"
  | "customFields"
  | "permitDocUrl"
  | "permitDocUrls"
  | "completionPhotoUrls"
  | "materialReceiptUrls"
  | "createdBy"
  | "createdAt"
  | "updatedBy"
  | "updatedAt"
> & {
  id?: string;
};
