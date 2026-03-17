import { adminDb } from "@/server/firebase/admin";
import { mapLegacyActivity } from "@/domain/activity/mapper";
import { parseActivityInput } from "@/domain/activity/schema";
import type { ActivityEntry } from "@/domain/activity/types";
import { buildIsoNow, sortByNewest } from "@/server/repositories/helpers";

const activityCollection = () => adminDb().collection("activity");

export async function listActivity(limitCount = 20): Promise<ActivityEntry[]> {
  const snapshot = await activityCollection().get();
  return sortByNewest(
    snapshot.docs.map((doc) => mapLegacyActivity(doc.id, doc.data())),
    (entry) => entry.timestamp,
  ).slice(0, limitCount);
}

export async function logActivity(input: Record<string, unknown>) {
  const payload = parseActivityInput(input);
  await activityCollection().add({
    ...payload,
    timestamp: buildIsoNow(),
  });
}
