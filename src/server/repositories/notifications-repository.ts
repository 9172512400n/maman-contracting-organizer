import { adminDb } from "@/server/firebase/admin";
import { mapLegacyNotification } from "@/domain/notifications/mapper";
import { parseNotificationFormData } from "@/domain/notifications/schema";
import type { Notification } from "@/domain/notifications/types";
import { buildIsoNow, sortByNewest } from "@/server/repositories/helpers";

const notificationsCollection = () => adminDb().collection("notifications");

export async function listNotifications(limitCount = 20): Promise<Notification[]> {
  const snapshot = await notificationsCollection().get();
  return sortByNewest(
    snapshot.docs.map((doc) => mapLegacyNotification(doc.id, doc.data())),
    (entry) => entry.timestamp,
  ).slice(0, limitCount);
}

export async function createNotification(formData: FormData, sender: { email: string; name: string }) {
  const payload = parseNotificationFormData(formData);
  await notificationsCollection().add({
    message: payload.message,
    sentBy: sender.name || sender.email,
    sentByEmail: sender.email,
    timestamp: buildIsoNow(),
    read: false,
  });
}

export async function deleteNotification(id: string) {
  await notificationsCollection().doc(id).delete();
}
