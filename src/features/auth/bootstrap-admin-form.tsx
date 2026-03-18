"use client";

import { FormEvent, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, deleteUser, updateProfile } from "firebase/auth";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getClientAuth, getClientDb } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth-provider";

export function BootstrapAdminForm({
  adminEmail,
}: {
  adminEmail: string;
}) {
  const router = useRouter();
  const { status } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedEmail = adminEmail.trim().toLowerCase();

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
      if (!name.trim()) {
        throw new Error("Name is required.");
      }

      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      const auth = await getClientAuth();
      const createdUser = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

      try {
        await updateProfile(createdUser.user, {
          displayName: name.trim(),
        }).catch(() => undefined);

        await setDoc(
          doc(collection(getClientDb(), "users")),
          {
            email: normalizedEmail,
            name: name.trim(),
            role: "Admin",
            phone: "",
            invitedBy: normalizedEmail,
            invitedAt: serverTimestamp(),
            inviteAcceptedAt: serverTimestamp(),
            activatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: "active",
            authUid: createdUser.user.uid,
            removed: false,
            inviteToken: "",
            inviteLink: "",
          },
          { merge: true },
        );

        router.push("/dashboard");
        router.refresh();
      } catch (bootstrapError) {
        await deleteUser(createdUser.user).catch(() => undefined);
        throw bootstrapError;
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create the first admin account.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="public-card" style={{ marginTop: 24 }}>
      <div className="brand-stack">
        <span className="eyebrow">Development only</span>
        <h2>Create first admin</h2>
        <p className="muted">
          This bootstrap is only for the first local admin on the development Firebase project.
        </p>
        <strong>{normalizedEmail}</strong>
      </div>

      <form className="stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="bootstrap-name">Name</label>
          <input
            id="bootstrap-name"
            name="name"
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="field">
          <label htmlFor="bootstrap-password">Password</label>
          <input
            id="bootstrap-password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label htmlFor="bootstrap-confirm-password">Confirm password</label>
          <input
            id="bootstrap-confirm-password"
            name="confirmPassword"
            type="password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {error ? <div className="callout">{error}</div> : null}
        <button className="button-secondary" type="submit" disabled={pending}>
          {pending ? "Creating admin..." : "Create first admin"}
        </button>
      </form>
    </div>
  );
}
