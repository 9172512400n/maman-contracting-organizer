const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const envSetupFiles = ".env.development.local or .env.production.local";

const firebaseProjects = {
  development: {
    apiKey: "AIzaSyBifJ4xToQax9Ly-yjYlHVDVaeNrzXD_AI",
    authDomain: "maman-contracting-dev.firebaseapp.com",
    projectId: "maman-contracting-dev",
    storageBucket: "maman-contracting-dev.firebasestorage.app",
    messagingSenderId: "852574253879",
    appId: "1:852574253879:web:79f492d678cdd9c4b920b2",
    publicAppUrl: "http://localhost:3000",
  },
  production: {
    apiKey: "AIzaSyBVuXZnTjB2YaJRC6HEKdd9ITQrj-AmL2c",
    authDomain: "maman-contracting-app.firebaseapp.com",
    projectId: "maman-contracting-app",
    storageBucket: "maman-contracting-app.firebasestorage.app",
    messagingSenderId: "498283734366",
    appId: "1:498283734366:web:0d4704ae3212923a385bcf",
    publicAppUrl: "https://maman-contracting-organizer.vercel.app",
  },
} as const;

function currentFirebaseEnvironment() {
  const env = process.env.APP_ENV?.trim().toLowerCase();
  if (env === "production") {
    return "production";
  }

  if (env === "development") {
    return "development";
  }

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
}

const firebaseDefaults = firebaseProjects[currentFirebaseEnvironment()];

export const appEnv = {
  appName: "Maman Contracting Organizer",
  adminEmail: process.env.ADMIN_EMAIL ?? "nir@mamancontracting.com",
  publicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? firebaseDefaults.publicAppUrl,
  sessionCookieName: "maman_session",
  firebaseClient: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? firebaseDefaults.apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? firebaseDefaults.authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? firebaseDefaults.projectId,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? firebaseDefaults.storageBucket,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? firebaseDefaults.messagingSenderId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? firebaseDefaults.appId,
  },
  firebaseAdmin: {
    projectId:
      process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      firebaseDefaults.projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: rawPrivateKey?.replace(/\\n/g, "\n"),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
      firebaseDefaults.storageBucket,
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
    `Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in ${envSetupFiles}`,
    "or provide GOOGLE_APPLICATION_CREDENTIALS with a valid service-account JSON file path.",
  ].join(" ");
}
