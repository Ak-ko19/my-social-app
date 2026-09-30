# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 10 — Monitoring
**Step:** 2 — /health checks DB connectivity; structured logging; remove stray console.logs. (Step 1 DONE: `24deff3`.)

## Step 2 plan
- `GET /health` (public, no DB details ever): `SELECT 1` with a 3 s
  timeout → 200 `{status:'ok', db:'ok', uptimeSeconds}` or 503
  `{status:'error', db:'down'}`; `Cache-Control: no-store`. Replaces the
  old debug `GET /test-db` (only referenced by itself). `GET /` stays the
  cheap keep-alive target (no DB).
- `utils/logger.js`: info/warn/error(msg, fields). Production → one JSON
  line per event {level, time, msg, ...fields, err:{name, message,
  code, stack}}; dev → readable text. pg `detail` never logged.
- Request log middleware: {method, route pattern, status, ms, userId,
  requestId}; `X-Request-Id` header (a given safe one is reused);
  GET / and /health skipped; 5xx error, 4xx warn, else info.
- Every backend console.* (35) goes through the logger; the noisy
  per-disconnect socket log is removed. Frontend has no console.log
  (its console.error calls are real error paths — kept).
- Tests: /health ok / down / hanging DB (503 within the timeout, no error
  text); logger JSON + dev text + error serialisation; request log +
  X-Request-Id + skips; guard: no console.* in backend sources outside
  utils/logger.js (scripts/tests excluded).

## Step 2 progress
- [x] utils/logger.js, middleware/requestLogger.js, routes/healthRoutes.js
  (/test-db removed), wired in server.js
- [x] all 35 backend console.* calls → logger (15 files; none left);
  per-disconnect socket log removed
- [x] Found while converting: getFeed and 3 middlewares (auth check,
  requireAdmin, requireConversationParticipant) answered 500 by hand, so
  those failures never reached the Day 10 error log → sendServerError;
  the cleanup route reports its failure too
- [x] env.test: server start line is now `server started {"port":N}`
- [x] logger writes through console.* in every mode (one path; tests'
  spies see production JSON too); 2 test expectations adapted
- [x] monitoring.test.js 12 (health ok/down/hang, logger JSON/dev/pg
  detail, request log, X-Request-Id, skips, console guard, db pool
  error); mutation-checked (pg detail, concrete URL, stray console.log,
  missing pool error listener)
- [x] FOUND on a real production-mode server: stopping the database
  CRASHED the server (pg pool 'error' on an idle client, no listener →
  uncaught). Pre-existing: production likely crashed/cold-restarted
  whenever Neon dropped idle connections. Fixed in db.js; re-verified:
  /health 503 in 5 ms while down, server alive, 200 when the DB is back.
- [x] Backend 396/396; rehearsal PASSED; a2 b9 b12 + day10-errors (dist)
  green; GO_LIVE_CHECKLIST now checks /health (+ uptime-monitor tip)
- STEP 2 DONE

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations)
  and update the checklist's migration loop if migrations were added.
- Any new migration: up + down files, update tests/fixtures/schema.sql
  (+ testDb TABLES), and the rehearsal must pass.
- Day 10 error-log table: the Day 9 cleanup job (services/cleanupService)
  should prune it too (bounded retention), so it can't grow forever.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
- Playwright gotcha seen 3× now: getByRole/getByLabel/getByText name
  matching is a SUBSTRING match — use `exact: true` when one label is
  contained in another.

## Plan — Day 10 step 1: built-in error log + admin view + Sentry hook
- Storage that can't grow unbounded: migration 030 `error_groups` — ONE
  row per distinct error (fingerprint = sha1 of source + route + message
  with numbers/uuids/hex normalised), upserted: count++, last_seen,
  latest stack/status/user; resolved_at cleared when it happens again.
  Index on last_seen. Day 9 cleanup prunes groups not seen for 90 days.
- `services/errorLogService.js` report(err, {source, route, status,
  userId}): never throws, never awaited by callers; if the DB is down the
  write failing is only logged (no recursion). Per-fingerprint throttle:
  at most one write per 10 s, repeats counted in memory and added on the
  next write (an error storm can't hammer the DB).
- Hooks: sendServerError (all 103 controller 500s; route from res.req),
  errorHandler's unexpected 500s, socket handler failures (source
  'socket', route = event name), process unhandledRejection /
  uncaughtException (uncaught → report, then exit so Render restarts).
- Browser errors: POST /client-errors (public, optional auth, strict
  per-IP limit, field size caps) ← window error + unhandledrejection +
  a NEW top-level React ErrorBoundary (today a render crash = white
  screen; now a friendly translated "Something went wrong / Reload"
  screen). Max 10 reports per page load, keepalive fetch.
- Admin: GET /admin/errors?status=open|resolved&page= (50 per page),
  POST /admin/errors/:fingerprint/resolve; AdminScreen gets an "Errors"
  view: message, source, route, count, last/first seen, expandable
  stack, "Mark resolved". EN/MY/AR, RTL, dark, 375px.
- Sentry: `SENTRY_DSN` set → @sentry/node initialised (lazy require, so
  nothing loads without it) and report() also sends to Sentry. The
  package is installed (free, no account needed to install); using it
  needs the owner's DSN → LATER.md. Frontend Sentry skipped (would need a
  CSP change + another SDK); the built-in client error log covers it.
- Privacy: admin-only; pg error `detail` (may contain values) is never
  stored — only message + stack.
- Tests: service (grouping, normalisation, throttle, never throws,
  Sentry called only with DSN), hooks (500 route → group; socket;
  client endpoint caps + limit), admin API (admin only, list/resolve,
  reopen on recurrence), cleanup prunes; browser: error boundary screen
  + admin errors view.

## Progress
- [x] migration 030 + fixture + testDb list
- [x] errorLogService + Sentry hook (@sentry/node, lazy, SENTRY_DSN)
- [x] backend hooks (sendServerError, errorHandler, 8 socket sites via
  socketFailure(), process unhandledRejection/uncaughtException)
- [x] /client-errors + errorReporter (prod only) + ErrorBoundary
- [x] admin API + Errors view (AdminErrorsPanel), EN/MY/AR
- [x] cleanup prunes groups not seen for 90 days
- [x] Found + fixed while verifying:
  - throttled repeats were only written if the error happened AGAIN
    later → a burst that stopped was under-counted forever; now flushed
    when the 10 s window ends (timer, cancelled by a normal write);
  - a user deleted before the background write → FK violation → the
    error was LOST; now links the user only if they still exist;
  - tests raced on background writes → whenIdle() (also used by the
    crash handler: exit as soon as the report is saved, max 2 s);
  - "×2" rendered "2×" in Arabic → dir="ltr";
  - GO_LIVE_CHECKLIST migration loop got a literal "\n" from my edit →
    fixed, and golive-rehearsal.sh now checks the checklist's list
    against the migration files (mutation-checked).
- [x] Backend 384/384; errorLog.test 18/18 ×6; lint, i18n (810), build,
  headers; rehearsal 015→030 PASSED (+ checklist list check);
  day10-errors 17/17 on the production build (run-all runs it on a dist
  stack); b12, a2 green.
- STEP 1 DONE
