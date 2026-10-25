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
- **Flight sync** (`/api/connectors/**`, `/api/sync/run`) — see "Flight sync" below

Set one of:

- `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` — the full service account JSON (or base64-encoded), **or**
- `FIREBASE_ADMIN_PROJECT_ID` / `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` — the same, split into fields

and `ADMIN_EMAIL_ALLOWLIST` (server-side gate) plus `NEXT_PUBLIC_ADMIN_EMAIL_ALLOWLIST` (client-side, to show/hide the nav link) as comma-separated email addresses. Without a service account, these routes fall back to Application Default Credentials, which only works inside a GCP-hosted environment.

## Data model

Every document the client touches lives under `users/{uid}/{collection}/{docId}` in Firestore — see `src/lib/repo/firestoreRepos.ts` for the full read/write surface, and `firestore.rules` for the access rules (owner-only, deny-by-default). Collections: `templates`, `views`, `entries`, `flags`, `integrationRequests`, `connectors`, `certificates`, `knownPlaces`, `syncIgnored`. `meta/admin` and `connectorSecrets` are server-managed only (never touched by the client SDK).

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

## Flight sync (integrations)

A pilot can pull their flights from an employer's crew/flight-ops system instead of typing them in:

- **Pilot-configured connector** (`/app/integrations` → "I have an API key"): base URL, auth (API key header / bearer / basic / none), a date floor, a sync interval, and a declarative field mapping for the generic JSON adapter (`src/lib/sync/adapters/genericJson.ts`). The mapping describes where each EASA field lives in the API response, so a new crew system is a config change, not a code change.
- **Employer-configured connector** (`/employer/setup/[requestId]?token=…`): the pilot creates a request, sends the tokenized link to IT, and IT enters the API details. The token expires after 30 days.
- **Secrets** are encrypted with AES-256-GCM (`src/lib/crypto/secretBox.ts`, key in `CONNECTOR_SECRET_KEY`) and stored in `users/{uid}/connectorSecrets/{connectorId}`, which the client SDK is denied. The connector document itself never holds the secret.
- **Sync engine** (`src/lib/sync/server/runSync.ts`, pure planning in `src/lib/sync/planSync.ts`): deterministic entry ids from the source's flight id, so re-runs upsert instead of duplicating; fields the pilot edited by hand (`manualOverrides`) are never overwritten; manual entries for the same date/route are adopted rather than duplicated; entries the pilot deleted stay deleted (`users/{uid}/syncIgnored`). Incremental runs re-fetch the last 14 days to pick up corrections.
- **Scheduling**: `/api/sync/run` is called by Vercel Cron (`vercel.json`, daily at 03:00 UTC - raise the frequency if the Vercel plan allows) and protected by `CRON_SECRET`. "Sync now" in the UI runs the same engine on demand.

Required server env vars (see `.env.example`): Firebase Admin credentials, `CONNECTOR_SECRET_KEY`, `CRON_SECRET`. Deploy the updated rules/indexes (`connectorSecrets`, `syncIgnored`, collection-group index on `connectors.nextSyncAt`) with the command above.

## Known limitations

- **Only one adapter exists** (`generic_json`). Systems that need OAuth, POST bodies, XML, or CSV downloads need a new adapter implementing `FlightSourceAdapter` in `src/lib/sync/adapters/`.
- **Currency calculations** (`src/lib/currency/currency.ts`) follow FCL.060(b) per aircraft type (selectable on the dashboard) but do not model every exception. Treat the panel as a guide, not a compliance record.
- **CSV import** uses a hand-rolled parser (`src/lib/csvImport.ts`) rather than a library; it handles quoted fields, embedded commas/newlines, escaped quotes, Norwegian/ISO/slashed dates and H:MM durations, but hasn't been tested against every CSV dialect in the wild.
- **Sign-up is open** to anyone with the Firebase config, and emails are not verified.
