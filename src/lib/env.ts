const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

export const appEnv = {
  appName: "Maman Contracting Organizer",
  adminEmail: process.env.ADMIN_EMAIL ?? "nir@mamancontracting.com",
  publicAppUrl:
    process.env.NEXT_PUBLIC_APP_URL ?? "https://maman-contracting-organizer.vercel.app",
  sessionCookieName: "maman_session",
  firebaseClient: {
    apiKey:
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
      "AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c",
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
      "maman-contracting-app.firebaseapp.com",
    projectId:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "maman-contracting-app",
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
      "maman-contracting-app.firebasestorage.app",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "498283734366",
    appId:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
      "1:498283734366:web:0d4704ae3212923a385bcf",
  },
  firebaseAdmin: {
    projectId:
      process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      "maman-contracting-app",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: rawPrivateKey?.replace(/\\n/g, "\n"),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
      "maman-contracting-app.firebasestorage.app",
  },
};

export function hasFirebaseAdminCredentials() {
  return Boolean(
    appEnv.firebaseAdmin.projectId &&
      appEnv.firebaseAdmin.clientEmail &&
      appEnv.firebaseAdmin.privateKey,
  );
}

export function hasGoogleApplicationCredentials() {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export function firebaseAdminSetupMessage() {
  return [
    "Firebase Admin credentials are missing.",
    "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local",
    "or provide GOOGLE_APPLICATION_CREDENTIALS with a valid service-account JSON file path.",
  ].join(" ");
}
