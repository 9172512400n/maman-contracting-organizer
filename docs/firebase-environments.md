# Firebase Environments

## Projects

- Development Firebase project: `maman-contracting-dev`
- Production Firebase project: `maman-contracting-app`
- Firebase CLI default alias: `development`
- Firebase CLI production alias: `production`

## Env Files

- `.env.development.local` is used for local development commands.
- `.env.production.local` is used for local production commands.
- `APP_ENV=development` defaults to the dev Firebase project.
- `APP_ENV=production` defaults to the production Firebase project.
- Env files override the built-in defaults when present.

## Run Commands

```bash
# development Firebase
npm run dev

# development Firebase, production-style build
npm run build:dev
npm run start:dev

# production Firebase locally
npm run build
npm run start

# optional: hot reload while pointed at production Firebase
npm run dev:prod
```

## Firebase CLI Commands

```bash
# deploy rules to development
firebase deploy --project development --only firestore:rules,storage:rules

# deploy rules to production
firebase deploy --project production --only firestore:rules,storage:rules
```

## Still Needed

- Development server-side Firebase Admin credentials:
  `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`
- Or a dev service-account JSON file exposed through `GOOGLE_APPLICATION_CREDENTIALS`
- If you want local production server actions too, add the matching production Admin credentials to `.env.production.local`

## First Dev Admin

- On the dev login screen, use the `Create first admin` panel.
- It creates a Firebase Auth user and a matching `users` document with role `Admin`.
- The email used is `ADMIN_EMAIL` from the active dev config.
