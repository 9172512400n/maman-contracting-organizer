import { z } from "zod";
import type { UserInviteInput, UserUpdateInput } from "@/domain/users/types";

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.string().trim().default("Worker"),
});

const updateSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().default(""),
  role: z.string().trim().default("Worker"),
  phone: z.string().trim().default(""),
});

export function parseInviteFormData(formData: FormData): UserInviteInput {
  return inviteSchema.parse({
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "Worker"),
  });
}

export function parseUserUpdateFormData(formData: FormData): UserUpdateInput {
  return updateSchema.parse({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? "Worker"),
    phone: String(formData.get("phone") ?? ""),
  });
}
