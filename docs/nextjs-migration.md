# Next.js Migration Notes

This document summarizes the main changes made on branch `codex/nextjs-migration`.

## Goal

The project was moved away from the old single-file app structure into a Next.js app with:

- route-level separation
- feature-based UI organization
- reusable UI components
- Firebase client helpers isolated from screen code
- legacy Firebase collections kept in place without schema changes

The migration keeps the existing Firebase collections and document structure as the system of record.

## Current Architecture

Main app structure:

- `src/app`
  App Router pages and layouts
- `src/features`
  Screen-level features such as jobs, permits, tasks, schedule, dashboard, contacts, users
- `src/components`
  Shared UI building blocks
- `src/lib/firebase`
  Firebase client setup, auth/session helpers, and collection CRUD helpers
- `src/domain`
  Mapping and typing for legacy Firebase documents
- `legacy/static-app`
  Read-only snapshot of the old app for parity reference

## Authentication

The app now uses direct Firebase email/password sign-in from the browser.

Important changes:

- removed the original Next.js server-session dependency
- users can sign in directly with valid Firebase Auth credentials
- admin visibility in the UI is currently based on the matching `users` document and its `role`
- custom claims are no longer required for normal login

## Firebase

Current Firebase usage:

- `Auth`
  email/password sign-in
- `Firestore`
  jobs, permits, contacts, tasks, users, notifications, activity, schedule notes
- `Storage`
  job permit docs, permit docs, contact photos, contact business cards

Rules deployed:

- Firestore rules now include `scheduleNotes`
- Storage rules remain restricted to signed-in users and approved upload paths

## Major UI/Workflow Changes Already Implemented

### Dashboard

Restored:

- recent jobs search
- `Tasks & Reminders` title
- add-task popup
- `+ Push notification` popup
- admin-only clear action for activity log

### Jobs

Restored:

- list-first page layout
- search field
- legacy-style status filters:
  `All`, `Open`, `In Progress`, `Completed`, `Blocked`, `On Hold`
- add/edit through dialog instead of inline page form

### Permits

Restored:

- grouped by address
- expandable address groups
- per-permit selection checkboxes
- per-address `+ Add Permit`
- per-address `Scan Permit`
- DOT milling inspection panel with:
  - day
  - time
  - bureau selection
  - `Notify DOT`
- archived permits section

Current limitation:

- the old OCR-based scan flow is not fully restored yet
- current scan behavior opens the add-permit dialog with scanned files staged for upload

### Schedule

Restored:

- week-based schedule view
- crew filters
- previous/next week navigation
- per-day notes
- per-day `+ Add Job`
- per-day share action
- `Date TBD` section
- expandable job cards
- add/edit job modal from schedule

### Users / Admin visibility

Current admin-only UI behavior:

- `Users` navigation is shown only for admin users
- invite/manage-user flows remain grouped under the Users area instead of the old profile dropdown

## Shared Components Added

- `src/components/ui/dialog.tsx`
  reusable modal shell
- `src/features/jobs/job-editor-form.tsx`
  shared job edit/create form used by Jobs and Schedule

## Data Helpers Added or Expanded

In `src/lib/firebase/client-data.ts`:

- batch DOT-notified updater for permits
- schedule notes CRUD helpers
- existing CRUD retained for jobs, permits, contacts, tasks, notifications, users, activity

## What Still Needs More Parity Work

These are still incomplete compared to the legacy app:

- full permit OCR extraction flow
- deeper permit document workflows and advanced DOT behavior
- full legacy schedule share/export/move behavior
- remaining hidden/edge-case flows from the old single-file app

## Useful Commands

Run locally:

```bash
npm run dev
```

Verify code:

```bash
npm run lint
npm run build
```

Deploy Firestore rules:

```bash
firebase deploy --project maman-contracting-app --only firestore:rules
```

## Recommended Next Step

Continue the migration as a parity pass against `legacy/static-app/index.html`, feature by feature, instead of rebuilding screens from memory. That is the safest way to avoid losing hidden workflows.
