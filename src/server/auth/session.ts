import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appEnv } from "@/lib/env";
import { adminAuth } from "@/server/firebase/admin";

export type SessionUser = {
  uid: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export async function createSessionCookie(idToken: string) {
  const expiresIn = 1000 * 60 * 60 * 24 * 5;
  return adminAuth().createSessionCookie(idToken, { expiresIn });
}

export async function setSessionCookie(sessionCookie: string) {
  const cookieStore = await cookies();
  cookieStore.set(appEnv.sessionCookieName, sessionCookie, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 5,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(appEnv.sessionCookieName);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(appEnv.sessionCookieName)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      name: (decoded.name as string | undefined) ?? decoded.email ?? "",
      isAdmin: (decoded.email ?? "").toLowerCase() === appEnv.adminEmail.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }

  return session;
}
