"use client";

import { FormEvent, useEffect, useState } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getClientAuth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-provider";

export function LoginForm({
  nextPath,
}: {
  nextPath?: string;
}) {
  const router = useRouter();
  const { status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextPath || "/dashboard");
    }
  }, [nextPath, router, status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const auth = await getClientAuth();
      await signInWithEmailAndPassword(auth, email, password);
      router.push(nextPath || "/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed.");
    } finally {
      setPending(false);
    }
  }

  async function onForgotPassword() {
    setResetPending(true);
    setError(null);
    setMessage(null);
    try {
      if (!email) {
        throw new Error("Enter your email first.");
      }

      const auth = await getClientAuth();
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not send password reset email.",
      );
    } finally {
      setResetPending(false);
    }
  }

  return (
    <div className="public-shell">
      <div className="public-card">
        <div className="brand-stack">
          <span className="eyebrow">Maman Contracting</span>
          <h1>Sign in</h1>
          <p className="muted">
            This is the new Next.js workspace. Firebase auth stays in place, but the app itself now
            runs behind server boundaries.
          </p>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@mamancontracting.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error ? <div className="callout">{error}</div> : null}
          {message ? <p className="muted">{message}</p> : null}
          <div className="actions-row">
            <button className="button" type="submit" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </button>
            <button
              className="button-ghost"
              type="button"
              disabled={resetPending}
              onClick={onForgotPassword}
            >
              {resetPending ? "Sending..." : "Forgot password"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
