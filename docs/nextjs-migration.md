# Next.js Migration Notes

This branch moves the legacy single-file app into a Next.js App Router app while keeping the same Firebase project and legacy collection structure as the system of record.

## Current State

- `src/app`: App Router pages and layouts
- `src/features`: screen-level UI for dashboard, jobs, permits, contacts, tasks, schedule, and users
- `src/components`: shared UI pieces
- `src/lib/firebase`: browser auth and Firebase CRUD helpers
- `legacy/static-app`: parity reference for the old app

## Authentication And Data

- login uses direct Firebase email/password auth from the browser
- the old server-session dependency was removed
- admin UI visibility is based on the matching `users` document role
- legacy Firestore collections stay in place with no schema rewrite
- Firestore usage includes jobs, permits, contacts, tasks, users, notifications, activity, and schedule notes
- Storage is still used for permit docs and contact uploads

## App Shell / Navigation

- desktop keeps a left sidebar
- tablet uses a top bar with a drawer
- mobile uses a top bar, a reduced bottom nav for core sections, and a top-right account menu for user/admin actions
- `Users` remains admin-only in navigation and account actions

## Restored Workflows

- Dashboard: recent jobs search, task dialog, notification dialog, admin-only clear activity
- Jobs: list-first layout, legacy status filters, add/edit in dialog
- Permits: grouped by address, expandable groups, permit selection, DOT notification panel, archived section
- Schedule: week view, crew filters, day notes, add/edit from modal, `Date TBD`
- Users: invite and manage users inside the Users area

## Known Gaps

- full permit OCR extraction flow is not restored yet
- deeper permit document workflows still need parity work
- some schedule share/export/move behavior from the legacy app is still missing

## Useful Commands

```bash
npm run dev
npm run lint
npm run build
```

Firestore rules:

```bash
firebase deploy --project maman-contracting-app --only firestore:rules
```
