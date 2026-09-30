# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 11 — Bot protection
**Step:** 2 — Turnstile hook, on only if its env var exists (step 1 done).

## Step 1 plan
- `services/botProtection.js`:
  - form token = `<issuedAtMs>.<hmac>` (HMAC-SHA256, key derived from
    JWT_SECRET with a purpose label, so it can't be confused with a JWT).
    `GET /form-token` → { token }. checkFormToken(token, minMs): missing /
    forged / older than 2 h → 'Please reload the page and try again.';
    younger than minMs → 'Please wait a moment and try again.'
    Signup min 3 s, forgot-password min 2 s. Login: no token (password
    managers, future mobile app).
  - honeypot: body.website non-empty → same generic reload message.
  - login throttle (in memory, per lower-cased email, 15 min window):
    failures 0-2 → no delay; then 1 s, 2 s, 4 s, max 8 s before answering
    (right or wrong password); reset on success; map capped at 10k keys.
  - All of it off under NODE_ENV=test unless BOT_CHECKS_IN_TESTS=1
    (same pattern as RATE_LIMIT_IN_TESTS) so the 396 existing tests keep
    working without tokens.
- Limits: signup 10/h → 5/h per IP + new 20/day per IP; forgot-password
  new per-EMAIL limiter 3/h (keyBy 'email' = sha256 of the lower-cased
  address; falls back to IP) on top of the per-IP one.
- Frontend: Signup, Login, ForgotPassword get a visually hidden honeypot
  input (aria-hidden, tabIndex -1, autocomplete off); Signup +
  ForgotPassword fetch a form token on mount (useFormToken) and, if the
  user submits before the minimum time, wait out the rest (a fast real
  user never sees an error); an expired token is re-fetched once.
- New server messages (MY/AR): reload / wait / per-email reset limit.
- e2e-up.sh: optional E2E_BACKEND_ENV passthrough so a browser suite can
  run the backend with BOT_CHECKS_IN_TESTS=1.
- Tests: token valid / forged / expired / too fast / missing; honeypot;
  throttle curve + reset + cap; per-email limiter; routes wired;
  browser: real forms still work with checks ON (and a bot-style POST
  without token is refused).

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations
  and checks the checklist's migration list).
- Any new migration: up + down files, update tests/fixtures/schema.sql
  (+ testDb TABLES), GO_LIVE_CHECKLIST loop, and the rehearsal must pass.
- Logging: use utils/logger (a test forbids console.* in backend
  sources); 500s via sendServerError so they reach the error log.
- Suites that need the production build go in DIST_SUITES (run-all.sh).
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
- Playwright gotcha seen 4× now: getByRole/getByLabel/getByText name
  matching is a SUBSTRING match — use `exact: true` when one label is
  contained in another.

## Plan
(written at the start of each step)

## Progress
- Step 1 DONE (2026-09-30): built as planned. Deviations/decisions:
  - Login throttle also caps waiting attempts per account at 3 (more →
    429 "Too many login attempts for this account…"): a delay alone
    doesn't slow a bot firing guesses in parallel.
  - Honeypot is clipped (clip-path), not moved off-screen: a far-left
    offset would scroll sideways in Arabic.
  - Browser suites keep bot checks OFF (several sign users up straight
    via the API); `day11-bots` runs on its own stack with
    BOT_CHECKS_IN_TESTS=1 (run-all.sh BOT_SUITES). golive rehearsal runs
    NODE_ENV=test, so its API smoke is unaffected.
  - Verified: backend 412/412; mutation checks (9) all caught; day11-bots
    all green EN/MY/AR incl. stale-token retry and a frontend mutation;
    related suites day5/c2/c3/day8/b15/b16/a3 en+ar green.
- Next: Step 2 — Turnstile hook, on only if its env var exists.
