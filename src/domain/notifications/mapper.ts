import { asBoolean, asString } from "@/domain/common/legacy";
import type { Notification } from "@/domain/notifications/types";

export function mapLegacyNotification(id: string, raw: Record<string, unknown>): Notification {
  return {
    id,
    message: asString(raw.message),
    sentBy: asString(raw.sentBy),
    sentByEmail: asString(raw.sentByEmail),
    timestamp: asString(raw.timestamp),
    read: asBoolean(raw.read),
  };
}
