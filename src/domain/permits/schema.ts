import { z } from "zod";
import type { PermitUpsertInput } from "@/domain/permits/types";

const permitSchema = z.object({
  id: z.string().optional(),
  permitNumber: z.string().trim().default(""),
  permitTypeCode: z.string().trim().default(""),
  validFrom: z.string().trim().default(""),
  expirationDate: z.string().trim().default(""),
  permitHolder: z.string().trim().default(""),
  jobAddress: z.string().trim().default(""),
  status: z.string().trim().default("Pending"),
  notes: z.string().trim().default(""),
  linkedJobId: z.string().trim().default(""),
});

export function parsePermitFormData(formData: FormData): PermitUpsertInput {
  return permitSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
    permitNumber: String(formData.get("permitNumber") ?? ""),
    permitTypeCode: String(formData.get("permitTypeCode") ?? ""),
    validFrom: String(formData.get("validFrom") ?? ""),
    expirationDate: String(formData.get("expirationDate") ?? ""),
    permitHolder: String(formData.get("permitHolder") ?? ""),
    jobAddress: String(formData.get("jobAddress") ?? ""),
    status: String(formData.get("status") ?? "Pending"),
    notes: String(formData.get("notes") ?? ""),
    linkedJobId: String(formData.get("linkedJobId") ?? ""),
  });
}
