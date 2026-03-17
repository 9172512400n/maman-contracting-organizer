const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const functions = require("firebase-functions/v1");

initializeApp();

function buildClaims(userDoc) {
  const role =
    typeof userDoc?.role === "string" && userDoc.role.trim() ? userDoc.role.trim() : "Worker";
  const active = userDoc?.status === "active" && userDoc?.removed !== true;
  return {
    role,
    active,
    admin: active && role === "Admin",
  };
}

async function clearUserIdentity(authUid, disable = true) {
  if (!authUid) {
    return;
  }

  const auth = getAuth();
  await auth.setCustomUserClaims(authUid, {});
  if (disable) {
    await auth.updateUser(authUid, { disabled: true }).catch((error) => {
      functions.logger.warn("Failed to disable user while clearing identity.", { authUid, error });
    });
  }
}

exports.syncUserClaims = functions.firestore.document("users/{userId}").onWrite(async (change) => {
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  const beforeAuthUid = typeof before?.authUid === "string" ? before.authUid : "";
  const afterAuthUid = typeof after?.authUid === "string" ? after.authUid : "";

  if (beforeAuthUid && beforeAuthUid !== afterAuthUid) {
    await clearUserIdentity(beforeAuthUid, true);
  }

  if (!after) {
    await clearUserIdentity(beforeAuthUid, true);
    return;
  }

  if (!afterAuthUid) {
    return;
  }

  const auth = getAuth();
  const claims = buildClaims(after);
  await auth.setCustomUserClaims(afterAuthUid, claims);

  const shouldDisable = claims.active !== true;
  try {
    const existing = await auth.getUser(afterAuthUid);
    if (existing.disabled !== shouldDisable) {
      await auth.updateUser(afterAuthUid, { disabled: shouldDisable });
    }
  } catch (error) {
    functions.logger.warn("Failed to sync auth disabled state.", { authUid: afterAuthUid, error });
  }
});
