# Maman Contracting Organizer

This branch contains the Next.js rewrite of the legacy Firebase single-page app.

## Structure

- `legacy/static-app`: frozen reference copy of the original app
- `src/app`: Next.js App Router routes and layouts
- `src/features`: page-level UI and feature composition
- `src/domain`: typed models, validation, and legacy mappers
- `src/server`: Firebase admin access, repositories, auth, and server actions

## Environment

Public Firebase config can be provided through `NEXT_PUBLIC_FIREBASE_*` variables. If omitted, the legacy project defaults are used.

Server-side Firebase admin access expects either service-account env vars or application default credentials:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Optional variables:

- `ADMIN_EMAIL`
- `NEXT_PUBLIC_APP_URL`
- `FIREBASE_STORAGE_BUCKET`

## Commands

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run test:run`
