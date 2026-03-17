import { z } from "zod";
import type { ContactUpsertInput } from "@/domain/contacts/types";

const contactSchema = z.object({
  id: z.string().optional(),
  companyName: z.string().trim().min(1, "Company name is required"),
  phone: z.string().trim().default(""),
  email: z.string().trim().default(""),
  address: z.string().trim().default(""),
  notes: z.string().trim().default(""),
  primaryPersonName: z.string().trim().default(""),
  primaryPersonPhone: z.string().trim().default(""),
  primaryPersonRole: z.string().trim().default(""),
});

export function parseContactFormData(formData: FormData): ContactUpsertInput {
  return contactSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
    companyName: String(formData.get("companyName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    primaryPersonName: String(formData.get("primaryPersonName") ?? ""),
    primaryPersonPhone: String(formData.get("primaryPersonPhone") ?? ""),
    primaryPersonRole: String(formData.get("primaryPersonRole") ?? ""),
  });
}
