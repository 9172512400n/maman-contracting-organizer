import { z } from "zod";

const activitySchema = z.object({
  action: z.string().trim().min(1),
  jobAddress: z.string().trim().default(""),
  taskTitle: z.string().trim().default(""),
  note: z.string().trim().default(""),
  doneBy: z.string().trim().default(""),
  doneByEmail: z.string().trim().default(""),
});

export function parseActivityInput(input: Record<string, unknown>) {
  return activitySchema.parse(input);
}
