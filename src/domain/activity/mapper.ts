import { asString } from "@/domain/common/legacy";
import type { ActivityEntry } from "@/domain/activity/types";

export function mapLegacyActivity(id: string, raw: Record<string, unknown>): ActivityEntry {
  return {
    id,
    action: asString(raw.action),
    jobAddress: asString(raw.jobAddress),
    taskTitle: asString(raw.taskTitle),
    note: asString(raw.note),
    doneBy: asString(raw.doneBy),
    doneByEmail: asString(raw.doneByEmail),
    timestamp: asString(raw.timestamp),
  };
}
