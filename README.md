# Maman Contracting Organizer

This branch contains the Next.js rewrite of the legacy Firebase single-page app.

## Structure

- `legacy/static-app`: frozen reference copy of the original app
- `src/app`: Next.js App Router routes and layouts
- `src/features`: page-level UI and feature composition
- `src/domain`: typed models, validation, and legacy mappers
- `src/server`: Firebase admin access, repositories, auth, and server actions

## Environment

Firebase supports both explicit env files and a built-in environment preset. Local development defaults to the development Firebase project, and production commands default to the production Firebase project. `.env.development.local` and `.env.production.local` override those defaults when present.

Server-side Firebase admin access expects either service-account env vars or application default credentials:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Optional variables:

- `ADMIN_EMAIL`
- `NEXT_PUBLIC_APP_URL`
- `FIREBASE_STORAGE_BUCKET`

## Commands

- Development Firebase: `npm run dev`
- Development Firebase build: `npm run build:dev && npm run start:dev`
- Production Firebase locally: `npm run build && npm run start`
- Production Firebase with hot reload: `npm run dev:prod`
- Lint: `npm run lint`
- Tests: `npm run test:run`

See [docs/firebase-environments.md](./docs/firebase-environments.md) for the exact file setup and Firebase CLI project aliases.
