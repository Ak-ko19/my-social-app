# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 13 — Test coverage
**Step:** 1 — Add browser suites to CI.

## Step 1 plan
- Portability (suites were Windows-only: psql.exe, pg_ctl.exe,
  netstat/taskkill). Edge stays: GitHub's Ubuntu runners ship Microsoft
  Edge, so channel 'msedge' works there unchanged.
  - e2e/pg.cjs: PSQL path (PG_BIN, else the Windows default if present,
    else `psql` on PATH); the 11 suites use it.
  - e2e-up.sh / e2e-down.sh: same tool lookup; E2E_EXTERNAL_DB=1 = the
    database server is already running (CI service container) → no
    pg_ctl; port cleanup via netstat/taskkill on Windows, else fuser/kill.
- run-all.sh: E2E_ONLY="a b c" runs just those suites (any group; "a3"
  = visual matrix) — for a CI smoke subset.
- ci.yml (private repo, 2000 free min/month → can't run ~40 min per push):
  - browser-smoke on every push/PR: ~8 key suites (walkthrough, own
    post, DM, admin, reports, sessions, dist+CSP, bot checks).
  - browser-full on PRs to master + manual (workflow_dispatch): all
    suites + A3, with Noto fonts installed for MY/AR rendering.
  - Postgres 17 service on :55433 with trust auth (throwaway).
  - out-*.txt + screenshots uploaded as an artifact on failure.
- Guard test (backend, like cleanup.yml's): the workflow's E2E_ONLY names
  real suites, services/ports match the scripts.
- Verification limits: no Linux here (no WSL/Docker) → verify the
  portable paths on Windows (PG_BIN unset→default, E2E_EXTERNAL_DB=1,
  E2E_ONLY); the first real Linux run is for the owner to check (LATER #1).

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations
  and checks the checklist's migration list).
- Any new migration: up + down files, update tests/fixtures/schema.sql
  (+ testDb TABLES), GO_LIVE_CHECKLIST loop, and the rehearsal must pass.
- Logging: use utils/logger (a test forbids console.* in backend
  sources); 500s via sendServerError so they reach the error log.
- Suites that need the production build go in DIST_SUITES (run-all.sh);
  ones that need the real bot checks in BOT_SUITES; Turnstile-on ones in
  TURNSTILE_SUITES.
- Day 11: bot checks (form token, honeypot, login delay) are OFF under
  NODE_ENV=test unless BOT_CHECKS_IN_TESTS=1. Suites that sign users up
  straight through the API only work on the default stack.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
- GO_LIVE_CHECKLIST edits: use the Edit tool, never a node/heredoc
  script — `\n` inside a quoted heredoc lands as a literal "\n" (bit
  twice, Days 10 and 12; the rehearsal catches it).
- Mutation checks edit backend files: never run them while a browser
  stack is starting (Day 12 crash). Jest files that send many DMs:
  `beforeEach(resetMessageRateLimits)` (services/rateLimiter.js).
- Playwright gotcha seen 4× now: getByRole/getByLabel/getByText name
  matching is a SUBSTRING match — use `exact: true` when one label is
  contained in another.

## Plan
Step 2 — Vitest + React Testing Library:
- devDependencies: vitest, jsdom, @testing-library/react, /user-event,
  /jest-dom (free npm packages, no account). vite.config test block
  (jsdom, setup file: jest-dom matchers, i18n in EN, cleanup).
- `npm test` = vitest run; CI frontend job runs it after lint.
- Tests (behaviour, not snapshots):
  - utils: safeHttpUrl (carry-over), formatDate longTime, serverErrorText
    translation (MY/AR) + fallback.
  - useFormGuard: honeypot sent, waits out the minimum, stale token
    refetched once, Turnstile off → no script.
  - ReportDialog: needs a reason, sends targetType/id/details, success.
  - MessageBubble: report only on others' persisted messages, edit/delete
    only own, deleted → no actions.
  - CommentSection: Report only on others' comments.
  - Login: suspended → "until <date>", banned → server text.
  - ErrorBoundary: fallback screen instead of a white page.
- eslint: vitest globals for *.test.jsx.

## Progress
- Step 1 DONE (2026-09-30): built as planned. Verified: backend 453/453
  (ciWorkflow guard 8 tests); CI smoke command run locally in
  E2E_EXTERNAL_DB mode (4 suites green, cluster left alone); normal mode
  b12/day12-review/b3 green; psql lookup checked in every mode. Not
  verifiable here: the real Linux run (LATER #1).
- Step 2 DONE (2026-09-30): Vitest 5 + RTL + jsdom; 30 tests (utils incl.
  safeUrl, useFormGuard, ReportDialog, MessageBubble, CommentSection,
  Modal, ErrorBoundary, Login); CI frontend job runs `npm test`.
  FOUND + FIXED a real bug: Modal re-focused its panel on every parent
  render, so text fields inside dialogs (report details, account
  deletion confirm, …) took only one letter. Guarded by Modal tests
  (fail on the old code) + day12-report now types key by key.
  Verified: backend 454/454; vitest 30/30; lint/build/i18n; modal-using
  suites b3/b11/b12/b13/b14/day8-list/day12-report + A3 EN/MY/AR green.
  npm audit fix: brace-expansion (via eslint), 0 vulnerabilities.
- Next: Day 13 close — full browser run, Progress Log, reset WIP.
