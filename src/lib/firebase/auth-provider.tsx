"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { User, onIdTokenChanged, signOut } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";
import type { AppSession } from "@/lib/firebase/auth-utils";
import { refreshSession } from "@/lib/firebase/auth-utils";

type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  session: AppSession | null;
  firebaseUser: User | null;
  refreshClaims: (forceRefresh?: boolean) => Promise<AppSession | null>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [session, setSession] = useState<AppSession | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const auth = await getClientAuth();
      unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
        if (!alive) {
          return;
        }

        if (!nextUser) {
          setFirebaseUser(null);
          setSession(null);
          setStatus("unauthenticated");
          return;
        }

        setFirebaseUser(nextUser);
        const nextSession = await refreshSession(nextUser);
        if (!alive) {
          return;
        }

        setSession(nextSession);
        setStatus("authenticated");
      });
    })();

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      firebaseUser,
      refreshClaims: async (forceRefresh = true) => {
        if (!firebaseUser) {
          return null;
        }

        const nextSession = await refreshSession(firebaseUser, forceRefresh);
        setSession(nextSession);
        setStatus("authenticated");
        return nextSession;
      },
      signOutUser: async () => {
        const auth = await getClientAuth();
        await signOut(auth);
        setFirebaseUser(null);
        setSession(null);
        setStatus("unauthenticated");
      },
    }),
    [firebaseUser, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
