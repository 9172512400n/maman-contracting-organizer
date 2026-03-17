import { App, applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  appEnv,
  firebaseAdminSetupMessage,
  hasFirebaseAdminCredentials,
  hasGoogleApplicationCredentials,
} from "@/lib/env";

let adminApp: App | undefined;

function createFirebaseAdminApp() {
  if (adminApp) {
    return adminApp;
  }

  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  if (hasFirebaseAdminCredentials()) {
    adminApp = initializeApp({
        credential: cert({
          projectId: appEnv.firebaseAdmin.projectId,
          clientEmail: appEnv.firebaseAdmin.clientEmail,
          privateKey: appEnv.firebaseAdmin.privateKey,
        }),
        storageBucket: appEnv.firebaseAdmin.storageBucket,
      });
    return adminApp;
  }

  if (hasGoogleApplicationCredentials()) {
    adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: appEnv.firebaseAdmin.projectId,
        storageBucket: appEnv.firebaseAdmin.storageBucket,
      });
    return adminApp;
  }

  throw new Error(firebaseAdminSetupMessage());
}

export function adminAuth() {
  return getAuth(createFirebaseAdminApp());
}

export function adminDb() {
  return getFirestore(createFirebaseAdminApp());
}

export function adminStorage() {
  return getStorage(createFirebaseAdminApp()).bucket(appEnv.firebaseAdmin.storageBucket);
}
