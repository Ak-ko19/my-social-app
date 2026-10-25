# MySocialApp

A Facebook-style social network: posts with photos and polls, comments and
reactions, stories, following and friends, private accounts, direct and
group chats (live, with voice notes and photos), groups, pages, events,
search, notifications and web push, an admin screen, and English and Arabic
(full right-to-left) throughout. People may write in any language.

| Folder | What it is |
| --- | --- |
| `backend/` | Node.js + Express REST API, Socket.IO for live chat, PostgreSQL |
| `frontend/` | React + Vite web app (installable as a PWA) |
| `e2e/` | Browser test suites (Playwright, headless Edge) on a throwaway local stack |

For the owner, in simple English: `OWNER_GUIDE.md` (what the app does, how
to run and demo it, what each LATER.md item turns on).

Planning and history: `MONTH_PLAN.md` (the plan and the Progress Log),
`PROJECT_DETAILED_GUIDE.md` (how each feature was built), `LATER.md`
(things only the owner can do), `GO_LIVE_CHECKLIST.md` (deploying).

## Run it locally

You need Node.js 24 and PostgreSQL 17.

```bash
# 1. A database with the app's schema
createdb mysocialapp
psql -d mysocialapp -f backend/tests/fixtures/schema.sql

# 2. The API on :3000
cd backend
npm install
cp .env.example .env   # then set DATABASE_URL and JWT_SECRET (see below)
node server.js

# 3. The web app on :5173 (another terminal)
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3000
npm run dev
```

`backend/tests/fixtures/schema.sql` is the full current schema (the
go-live rehearsal checks it matches the migrations). An existing database is
upgraded with the migrations instead:
`node backend/scripts/run-migration.js backend/migrations/<file>.up.sql`
(in order; `GO_LIVE_CHECKLIST.md` has the list).

Demo content: `cd backend && npm run seed:demo` (refuses to run against a
production database).

### Environment variables (backend)

Names only; `backend/.env.example` explains each one, and the server checks
them at startup with a clear message.

- **Required:** `DATABASE_URL`, `JWT_SECRET`; in production also
  `ALLOWED_ORIGINS` and `FRONTEND_URL` (locally they default to
  `http://localhost:5173`).
- **Optional:** `PORT`, `TRUST_PROXY`; photos and voice notes:
  `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`;
  email: `BREVO_API_KEY` or `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` /
  `EMAIL_PASS`, and `EMAIL_FROM`; push: `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; `TURNSTILE_SITE_KEY` /
  `TURNSTILE_SECRET_KEY` (human check); `SENTRY_DSN`; `CLEANUP_SECRET` (the
  daily cleanup job); `API_DOCS` (the API reference in production).

Without the optional ones the app still works: uploads, emails, push and the
human check are simply off (the app hides what depends on them).

## The API

- Reference: `GET /docs` (Swagger UI) and `GET /openapi.json` on the
  running backend; the spec is built from `backend/docs/openapi/`.
- Live events (Socket.IO): `backend/docs/REALTIME.md`.
- Every route must be documented, and every API test's responses must match
  the spec (`backend/tests/api/openapiSpec.test.js`,
  `backend/tests/helpers/contract.js`).

## Tests

```bash
cd backend && npm test              # API tests (a throwaway Postgres cluster on :55433)
cd frontend && npm test             # component tests (Vitest)
cd frontend && npm run lint && npm run check:i18n && npm run build && npm run check:bundle
cd e2e && npm install && E2E_ONLY="journeys-core" bash run-all.sh   # browser suites
```

The backend tests never touch `.env`'s database. The browser suites run
each suite on a fresh local stack; see `e2e/README.md` (which suites exist
and how to run a few) and `e2e/JOURNEYS.md` (the 15 most important user
journeys). CI (`.github/workflows/ci.yml`) runs the API and component tests,
lint, the i18n checks, the build, a dependency audit and the browser smoke
suites on every push, and every browser suite on pull requests to `master`.

## Languages

The UI is English and Arabic only, with full right-to-left layout in Arabic.
Every user-facing string is in `frontend/src/i18n/locales/en.json` and
`ar.json`, and server messages have Arabic versions in
`frontend/src/i18n/serverMessages.ar.js`. `npm run check:i18n` fails on a
missing translation, text that skips translation, or left/right CSS that
should be logical. What people write stays in any language (Burmese typed
in Zawgyi is stored as Unicode).
