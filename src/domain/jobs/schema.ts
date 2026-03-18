import { z } from "zod";
import type { JobUpsertInput } from "@/domain/jobs/types";

const jobSchema = z.object({
  id: z.string().optional(),
  customerName: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  email: z.string().trim().default(""),
  invoiceNumber: z.string().trim().default(""),
  address: z.string().trim().default(""),
  taskType: z.string().trim().default(""),
  projectSize: z.string().trim().default(""),
  jobType: z.string().trim().default(""),
  concreteSub: z.string().trim().default(""),
  altParkingBlocked: z.boolean().default(false),
  altParkingDays: z.string().trim().default(""),
  altParkingTime: z.string().trim().default(""),
  blocked: z.string().trim().default("no"),
  status: z.string().trim().default("Pending"),
  scheduleDay: z.string().trim().default(""),
  completionDay: z.string().trim().default(""),
  permitCode: z.string().trim().default(""),
  permitNumber: z.string().trim().default(""),
  permitExpiry: z.string().trim().default(""),
  notes: z.string().trim().default(""),
});

export function parseJobFormData(formData: FormData): JobUpsertInput {
  return jobSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
    customerName: String(formData.get("customerName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    invoiceNumber: String(formData.get("invoiceNumber") ?? ""),
    address: String(formData.get("address") ?? ""),
    taskType: String(formData.get("resolvedTaskType") ?? formData.get("taskType") ?? ""),
    projectSize: String(formData.get("projectSize") ?? ""),
    jobType: String(formData.get("jobType") ?? ""),
    concreteSub: String(formData.get("concreteSub") ?? ""),
    altParkingBlocked: formData.get("altParkingBlocked") === "on",
    altParkingDays: String(formData.get("altParkingDays") ?? ""),
    altParkingTime: String(formData.get("altParkingTime") ?? ""),
    blocked: String(formData.get("blocked") ?? "no"),
    status: String(formData.get("status") ?? "Pending"),
    scheduleDay: String(formData.get("scheduleDay") ?? ""),
    completionDay: String(formData.get("completionDay") ?? ""),
    permitCode: String(formData.get("permitCode") ?? ""),
    permitNumber: String(formData.get("permitNumber") ?? ""),
    permitExpiry: String(formData.get("permitExpiry") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
}
