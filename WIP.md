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
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`, and
  consider one for `hooks/useFormGuard.jsx` (wait + stale-token retry).
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
(written at the start of each step)

## Progress
- Step 1 DONE (2026-09-30): built as planned. Verified: backend 453/453
  (ciWorkflow guard 8 tests); CI smoke command run locally in
  E2E_EXTERNAL_DB mode (4 suites green, cluster left alone); normal mode
  b12/day12-review/b3 green; psql lookup checked in every mode. Not
  verifiable here: the real Linux run (LATER #1).
- Next: Step 2 — Vitest + React Testing Library.
