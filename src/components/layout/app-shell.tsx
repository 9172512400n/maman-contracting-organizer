"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { initialsFor } from "@/lib/utils";
import { useAuth } from "@/lib/firebase/auth-provider";

const navigation = [
  { href: "/dashboard", label: "Dashboard", short: "Home" },
  { href: "/jobs", label: "Jobs", short: "Jobs" },
  { href: "/permits", label: "Permits", short: "Permits" },
  { href: "/contacts", label: "Contacts", short: "Contacts" },
  { href: "/tasks", label: "Tasks", short: "Tasks" },
  { href: "/schedule", label: "Schedule", short: "Schedule" },
  { href: "/users", label: "Users", short: "Users" },
];

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, session, signOutUser } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [pathname, router, status]);

  if (status === "loading") {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="brand-stack">
            <span className="eyebrow">Maman Contracting</span>
            <h1>Loading workspace</h1>
            <p className="muted">Checking your Firebase authentication state.</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated" || !session) {
    return (
      <div className="public-shell">
        <div className="public-card">
          <div className="brand-stack">
            <span className="eyebrow">Redirecting</span>
            <h1>Sign-in required</h1>
            <p className="muted">Sending you to login.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-stack">
          <span className="eyebrow">Next.js Migration</span>
          <h1>Maman Contracting</h1>
          <p className="muted">
            Firebase schema frozen. UI, logic, and server boundaries are now separated.
          </p>
        </div>

        <div className="card">
          <div className="inline-meta">
            <span className="pill" data-tone="danger">
              {initialsFor(session.name, session.email)}
            </span>
            <span className="pill" data-tone={session.isAdmin ? "info" : "default"}>
              {session.isAdmin ? "Admin" : "Worker"}
            </span>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            <strong>{session.name || session.email}</strong>
            <span className="muted">{session.email}</span>
          </div>
        </div>

        <nav>
          {navigation
            .filter((item) => item.href !== "/users" || session.isAdmin)
            .map((item) => (
            <Link
              key={item.href}
              className="app-sidebar-link"
              data-active={pathname.startsWith(item.href)}
              href={item.href}
            >
              <span>{item.label}</span>
              <span className="muted">{item.short}</span>
            </Link>
          ))}
        </nav>

        <div style={{ marginTop: 24 }}>
          <button
            className="button-ghost"
            type="button"
            onClick={() => {
              void signOutUser().then(() => router.replace("/login"));
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="page-stack">{children}</div>
      </main>
    </div>
  );
}
