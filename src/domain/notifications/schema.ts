import { z } from "zod";

const notificationSchema = z.object({
  message: z.string().trim().min(1, "Message is required"),
});

export function parseNotificationFormData(formData: FormData) {
  return notificationSchema.parse({
    message: String(formData.get("message") ?? ""),
  });
}
