"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteClient } from "@/lib/firebase/client-data";
import { useAuth } from "@/lib/firebase/auth-provider";

export function InviteAcceptForm({
  email,
  invite,
}: {
  email: string;
  invite: string;
}) {
  const router = useRouter();
  const { status } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (!name) {
        throw new Error("Name is required.");
      }
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      await acceptInviteClient({
        email,
        token: invite,
        name,
        password,
      });

      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Invite activation failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="public-shell">
      <div className="public-card">
        <div className="brand-stack">
          <span className="eyebrow">Invite activation</span>
          <h1>Create your password</h1>
          <p className="muted">
            This uses the same legacy invite record in the `users` collection. Only the app
            structure changed.
          </p>
          <strong>{email}</strong>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error ? <div className="callout">{error}</div> : null}
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Creating account..." : "Accept invite"}
          </button>
        </form>
      </div>
    </div>
  );
}
