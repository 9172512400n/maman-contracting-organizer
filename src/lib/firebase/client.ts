"use client";

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";
import { appEnv } from "@/lib/env";

let firebaseApp: FirebaseApp | undefined;
let firebaseAuth: Auth | undefined;
let firebaseDb: Firestore | undefined;
let firebaseStorage: FirebaseStorage | undefined;

function getClientApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: appEnv.firebaseClient.apiKey,
        authDomain: appEnv.firebaseClient.authDomain,
        projectId: appEnv.firebaseClient.projectId,
        storageBucket: appEnv.firebaseClient.storageBucket,
        messagingSenderId: appEnv.firebaseClient.messagingSenderId,
        appId: appEnv.firebaseClient.appId,
      });

  return firebaseApp;
}

export async function getClientAuth() {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  firebaseAuth = getAuth(getClientApp());
  await setPersistence(firebaseAuth, browserLocalPersistence).catch(() => undefined);
  return firebaseAuth;
}

export function getClientDb() {
  if (firebaseDb) {
    return firebaseDb;
  }

  firebaseDb = getFirestore(getClientApp());
  return firebaseDb;
}

export function getClientStorage() {
  if (firebaseStorage) {
    return firebaseStorage;
  }

  firebaseStorage = getStorage(getClientApp());
  return firebaseStorage;
}
