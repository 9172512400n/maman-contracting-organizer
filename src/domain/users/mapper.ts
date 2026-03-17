import { asBoolean, asString, timestampToIso } from "@/domain/common/legacy";
import type { UserAccount } from "@/domain/users/types";

function userRank(user: UserAccount) {
  let score = 0;
  if (!user.removed) score += 10;
  if (user.status === "active") score += 100;
  if (user.status === "invited") score += 60;
  if (user.authUid) score += 25;
  if (user.id.startsWith("invite-")) score += 5;
  return score;
}

function userTime(user: UserAccount) {
  return (
    Date.parse(
      user.updatedAt ||
        user.activatedAt ||
        user.inviteAcceptedAt ||
        user.invitedAt ||
        "1970-01-01",
    ) || 0
  );
}

export function mapLegacyUser(id: string, raw: Record<string, unknown>): UserAccount {
  return {
    id,
    email: asString(raw.email).toLowerCase(),
    name: asString(raw.name),
    role: asString(raw.role) || "Worker",
    phone: asString(raw.phone),
    status: asString(raw.status),
    authUid: asString(raw.authUid),
    removed: asBoolean(raw.removed),
    removedBy: asString(raw.removedBy),
    removedAt: timestampToIso(raw.removedAt),
    invitedBy: asString(raw.invitedBy),
    invitedAt: timestampToIso(raw.invitedAt),
    inviteAcceptedAt: timestampToIso(raw.inviteAcceptedAt),
    inviteToken: asString(raw.inviteToken),
    inviteLink: asString(raw.inviteLink),
    activatedAt: timestampToIso(raw.activatedAt),
    updatedAt: timestampToIso(raw.updatedAt),
  };
}

export function dedupeUsersByEmail(users: UserAccount[]) {
  const byKey = new Map<string, UserAccount>();
  for (const user of users) {
    const key = user.email || user.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, user);
      continue;
    }

    const nextRank = userRank(user);
    const currentRank = userRank(existing);
    if (nextRank > currentRank || (nextRank === currentRank && userTime(user) > userTime(existing))) {
      byKey.set(key, user);
    }
  }

  return Array.from(byKey.values());
}
