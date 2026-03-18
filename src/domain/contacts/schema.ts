import { z } from "zod";
import type { ContactUpsertInput } from "@/domain/contacts/types";

const contactPersonSchema = z.object({
  name: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  role: z.string().trim().default(""),
});

const contactSchema = z.object({
  id: z.string().optional(),
  companyName: z.string().trim().min(1, "Company name is required"),
  phone: z.string().trim().default(""),
  email: z.string().trim().default(""),
  address: z.string().trim().default(""),
  notes: z.string().trim().default(""),
  persons: z.array(contactPersonSchema).default([]),
  primaryPersonName: z.string().trim().default(""),
  primaryPersonPhone: z.string().trim().default(""),
  primaryPersonRole: z.string().trim().default(""),
});

export function parseContactFormData(formData: FormData): ContactUpsertInput {
  const personsRaw = String(formData.get("personsJson") ?? "").trim();
  let persons: Array<{ name: string; phone: string; role: string }> = [];

  if (personsRaw) {
    try {
      const parsed = JSON.parse(personsRaw) as Array<{ name?: string; phone?: string; role?: string }>;
      if (Array.isArray(parsed)) {
        persons = parsed.map((person) => ({
          name: String(person?.name ?? ""),
          phone: String(person?.phone ?? ""),
          role: String(person?.role ?? ""),
        }));
      }
    } catch {
      persons = [];
    }
  }

  return contactSchema.parse({
    id: String(formData.get("id") ?? "") || undefined,
    companyName: String(formData.get("companyName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    persons,
    primaryPersonName: String(formData.get("primaryPersonName") ?? ""),
    primaryPersonPhone: String(formData.get("primaryPersonPhone") ?? ""),
    primaryPersonRole: String(formData.get("primaryPersonRole") ?? ""),
  });
}
