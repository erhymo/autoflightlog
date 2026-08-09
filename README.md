# AutoFlightLog

A personal EASA-format flight logbook for pilots, built with Next.js (App Router) and Firebase. Track flight time, landings, and currency; import/export CSV and PDF; and manage everything from a single-page logbook table.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Firebase Auth** (email/password) and **Firestore** as the data store, via the client SDK
- **Firebase Admin SDK** for server-only API routes (`/api/admin/**`, `/api/employer/**`)
- Tailwind CSS 4
- **Vitest** for unit tests

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Firebase web app config
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route and `/app` redirect to `/app/dashboard`.

### Required environment variables

See `.env.example`. The `NEXT_PUBLIC_FIREBASE_*` variables (from Firebase Console → Project settings → Your apps → Web app) are required for the app to boot at all.

Two feature areas additionally need **Firebase Admin** credentials (a service account), since they run server-side API routes with elevated Firestore/Auth access that bypasses the client-facing security rules:

- **Admin panel** (`/app/admin`) — user management (list, hide, disable, permanently delete)
- **Employer integration setup** (`/employer/setup/[requestId]`) — lets an employer's IT contact configure a connector via a tokenized link, without needing the pilot's own login

Set one of:

- `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` — the full service account JSON (or base64-encoded), **or**
- `FIREBASE_ADMIN_PROJECT_ID` / `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` — the same, split into fields

and `ADMIN_EMAIL_ALLOWLIST` (server-side gate) plus `NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST` (client-side, to show/hide the nav link) as comma-separated email addresses. Without a service account, these routes fall back to Application Default Credentials, which only works inside a GCP-hosted environment.

## Data model

Every document the client touches lives under `users/{uid}/{collection}/{docId}` in Firestore — see `src/lib/repo/firestoreRepos.ts` for the full read/write surface, and `firestore.rules` for the access rules (owner-only, deny-by-default). Collections: `templates`, `views`, `entries`, `flags`, `integrationRequests`, `connectors`, `certificates`. `meta/admin` is server-managed only (never touched by the client SDK).

The EASA field catalog and default template/view are defined in `src/types/fieldCatalog.ts`, `src/lib/defaults/easaTemplate.ts`, and `src/lib/layouts/easaLogbookLayout.ts`.

## Firestore rules & indexes

`firestore.rules` and `firestore.indexes.json` are versioned in this repo and deployed with:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project autoflightlog
```

Dry-run first with `--dry-run` to check the rules compile before pushing a live change.

## Scripts

```bash
npm run dev      # start the dev server
npm run build    # production build
npm run lint     # eslint
npm run test     # vitest (unit tests for currency calculations and CSV import/export)
```

## Known limitations

- **Integrations sync is not implemented.** The `/app/integrations` and employer setup flow let a pilot request API access and an employer configure a connector, but no scheduled job actually fetches or syncs flight data yet.
- **Currency calculations** (`src/lib/currency/currency.ts`) are a simplification of EASA Part-FCL recency rules — they don't filter by aircraft type or class. Treat the dashboard's currency panel as a rough guide, not a compliance record.
- **CSV import** uses a hand-rolled parser (`src/lib/csvImport.ts`) rather than a library; it handles quoted fields, embedded commas/newlines, and escaped quotes, but hasn't been tested against every CSV dialect in the wild.
