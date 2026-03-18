"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { appEnv } from "@/lib/env";
import { useAuth } from "@/lib/firebase/auth-provider";
import { createOrRefreshInvite, listUsers, removeUser, updateUser } from "@/lib/firebase/client-data";
import type { UserAccount } from "@/domain/users/types";

function randomInviteToken() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

function openInviteEmail(email: string, role: string, inviteLink: string) {
  const subject = encodeURIComponent("You're invited to Maman Contracting Organizer");
  const body = encodeURIComponent(
    "Hi,\n\n" +
      "You've been invited to join the Maman Contracting Organizer app.\n\n" +
      `Open this secure invite link and create your password:\n${inviteLink}\n\n` +
      `This invite is for: ${email}\n` +
      `Role: ${role}\n\n` +
      "After setting your password, you can log in to the app.\n\n" +
      "Welcome to the team!",
  );
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

export default function UsersPage() {
  const { session } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") ?? "";
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.isActive || !session.isAdmin) {
      return;
    }

    void loadUsers();
  }, [session?.isActive, session?.isAdmin]);

  const currentUser = users.find((item) => item.id === editId) ?? null;

  async function onCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = String(formData.get("role") ?? "Worker").trim() || "Worker";
    if (!email) {
      setError("Please enter an email address.");
      return;
    }

    const inviteToken = randomInviteToken();
    const inviteLink = `${appEnv.publicAppUrl}/invite?email=${encodeURIComponent(email)}&invite=${inviteToken}`;

    openInviteEmail(email, role, inviteLink);
    formData.set("inviteToken", inviteToken);

    setError(null);
    try {
      const link = await createOrRefreshInvite(formData, session);
      setInviteLink(link);
      form.reset();
      await loadUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create invite.");
    }
  }

  async function onUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await updateUser(new FormData(event.currentTarget));
      await loadUsers();
      router.replace("/users");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update user.");
    }
  }

  async function onRemoveUser(id: string) {
    if (!session) {
      return;
    }

    setError(null);
    try {
      await removeUser(id, session);
      await loadUsers();
      if (editId === id) {
        router.replace("/users");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not remove user.");
    }
  }

  if (!session?.isAdmin) {
    return (
      <SectionCard title="Users">
        <div className="callout">Only users with the `Admin` role can manage invites and users.</div>
      </SectionCard>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Users</p>
          <h1>User administration</h1>
          <p className="muted">Invites stay in the existing `users` collection with the same token fields.</p>
        </div>
        {currentUser ? (
          <Link className="button-ghost" href="/users">
            Clear edit
          </Link>
        ) : null}
      </div>

      {error ? <div className="callout">{error}</div> : null}
      {inviteLink ? (
        <div className="callout">
          Invite created:{" "}
          <a href={inviteLink} target="_blank" rel="noreferrer">
            {inviteLink}
          </a>
        </div>
      ) : null}

      <div className="panel-grid">
        <SectionCard title="Invite user">
          <form className="stack" onSubmit={onCreateInvite}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="worker@mamancontracting.com" />
            </div>
            <div className="field">
              <label htmlFor="role">Role</label>
              <select id="role" name="role" defaultValue="Worker">
                <option>Worker</option>
                <option>Manager</option>
                <option>Office</option>
                <option>Admin</option>
              </select>
            </div>
            <button className="button" type="submit">
              Create / refresh invite
            </button>
          </form>
        </SectionCard>

        <SectionCard title={currentUser ? "Edit user" : "Select a user to edit"}>
          {currentUser ? (
            <form key={currentUser.id} className="stack" onSubmit={onUpdateUser}>
              <input name="id" type="hidden" value={currentUser.id} />
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" defaultValue={currentUser.name} />
              </div>
              <div className="field">
                <label htmlFor="edit-role">Role</label>
                <select id="edit-role" name="role" defaultValue={currentUser.role || "Worker"}>
                  <option>Worker</option>
                  <option>Manager</option>
                  <option>Office</option>
                  <option>Admin</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="edit-phone">Phone</label>
                <input id="edit-phone" name="phone" defaultValue={currentUser.phone} />
              </div>
              <button className="button-secondary" type="submit">
                Save user
              </button>
            </form>
          ) : (
            <EmptyState title="No user selected" description="Choose Edit from the table below." />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Users">
        {loading ? (
          <p className="muted">Loading users...</p>
        ) : users.length === 0 ? (
          <EmptyState title="No users yet" description="Create an invite to start populating the admin list." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Invite link</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name || user.email}</strong>
                      <p className="muted">{user.email}</p>
                    </td>
                    <td>
                      <StatusPill label={user.status || "Unknown"} tone={user.removed ? "danger" : "info"} />
                    </td>
                    <td>{user.role || "Worker"}</td>
                    <td>
                      {user.inviteLink ? (
                        <a className="muted" href={user.inviteLink} target="_blank" rel="noreferrer">
                          Open invite
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="actions-row">
                        <Link className="button-ghost" href={`/users?edit=${user.id}`}>
                          Edit
                        </Link>
                        {user.email !== session.email ? (
                          <button
                            className="button-danger"
                            type="button"
                            onClick={() => {
                              void onRemoveUser(user.id);
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
