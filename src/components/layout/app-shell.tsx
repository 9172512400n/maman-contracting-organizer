"use client";

import { useEffect, useState } from "react";
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

const mobilePrimaryHrefs = new Set(["/dashboard", "/jobs", "/permits", "/schedule", "/contacts"]);

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, session, signOutUser } = useAuth();
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isAccountMenuOpen, setAccountMenuOpen] = useState(false);

  function closeNavigationMenus() {
    setDrawerOpen(false);
    setAccountMenuOpen(false);
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [pathname, router, status]);

  useEffect(() => {
    setDrawerOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isDrawerOpen && !isAccountMenuOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        setAccountMenuOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isAccountMenuOpen, isDrawerOpen]);

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

  const visibleNavigation = navigation.filter((item) => item.href !== "/users" || session.isAdmin);
  const primaryMobileNavigation = visibleNavigation.filter((item) => mobilePrimaryHrefs.has(item.href));
  const currentNavItem = visibleNavigation.find((item) => isActivePath(pathname, item.href)) ?? visibleNavigation[0];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <h1>Maman Contracting</h1>
        </div>

        <div className="card app-sidebar-profile">
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
          {visibleNavigation.map((item) => (
            <Link
              key={item.href}
              className="app-sidebar-link"
              data-active={isActivePath(pathname, item.href)}
              href={item.href}
              onClick={closeNavigationMenus}
            >
              <span>{item.label}</span>
              <span className="muted">{item.short}</span>
            </Link>
          ))}
        </nav>

        <div className="app-sidebar-footer">
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

      <div className="app-responsive-shell">
        <header className="app-topbar">
          <button
            className="icon-button"
            type="button"
            aria-label="Open navigation"
            aria-expanded={isDrawerOpen}
            onClick={() => {
              setDrawerOpen((open) => !open);
              setAccountMenuOpen(false);
            }}
          >
            <span />
            <span />
            <span />
          </button>
          <Link className="app-topbar-brand" href="/dashboard" onClick={closeNavigationMenus}>
            <span className="eyebrow">Maman Contracting</span>
            <strong>{currentNavItem?.label ?? "Workspace"}</strong>
          </Link>
          <button
            className="app-account-trigger"
            type="button"
            aria-label="Open account menu"
            aria-expanded={isAccountMenuOpen}
            onClick={() => {
              setAccountMenuOpen((open) => !open);
              setDrawerOpen(false);
            }}
          >
            {initialsFor(session.name, session.email)}
          </button>
        </header>

        <div
          className="app-shell-backdrop"
          data-open={isDrawerOpen || isAccountMenuOpen}
          onClick={() => {
            setDrawerOpen(false);
            setAccountMenuOpen(false);
          }}
          role="presentation"
        />

        <aside className="app-drawer" data-open={isDrawerOpen}>
          <div className="app-drawer-head">
            <div className="app-drawer-brand">
              <span className="eyebrow">Workspace</span>
              <strong>Maman Contracting</strong>
            </div>
            <button
              className="icon-button icon-button-close"
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
            >
              <span />
              <span />
            </button>
          </div>

          <div className="card app-drawer-profile">
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

          <nav className="app-drawer-nav" aria-label="Primary">
            {visibleNavigation.map((item) => (
              <Link
                key={item.href}
                className="app-drawer-link"
                data-active={isActivePath(pathname, item.href)}
                href={item.href}
                onClick={closeNavigationMenus}
              >
                <span>{item.label}</span>
                <span className="muted">{item.short}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <div className="app-account-menu" data-open={isAccountMenuOpen}>
          <div className="app-account-card">
            <div className="app-account-avatar">{initialsFor(session.name, session.email)}</div>
            <strong>{session.name || session.email}</strong>
            <span className="muted">{session.email}</span>
          </div>

          {session.isAdmin ? (
            <Link className="app-account-link" href="/users" onClick={closeNavigationMenus}>
              <span>Manage users</span>
              <span className="muted">Admin</span>
            </Link>
          ) : null}

          <button
            className="app-account-link app-account-signout"
            type="button"
            onClick={() => {
              void signOutUser().then(() => router.replace("/login"));
            }}
          >
            <span>Sign out</span>
            <span className="muted">Account</span>
          </button>
        </div>
      </div>

      <main className="app-main">
        <div className="page-stack">{children}</div>
      </main>

      <nav className="app-bottom-nav" aria-label="Mobile primary">
        {primaryMobileNavigation.map((item) => (
          <Link
            key={item.href}
            className="app-bottom-link"
            data-active={isActivePath(pathname, item.href)}
            href={item.href}
            onClick={closeNavigationMenus}
          >
            {item.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
