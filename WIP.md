# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 30 — GO LIVE #4 (owner, skipped) + fix top AUDIT_REPORT_2 items
**Step:** 3 — N2 flaky backend test (steps 1-2 committed 6f8a373, 202c830)

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

- This machine has 8 GB RAM (~2 GB free): run long browser runs in
  the foreground in E2E_ONLY batches; a background run got killed.

- Follow-up from Day 16: routes have no auth guard; auth-only screens
  (Admin, EditPage, ManageCommunity, …) re-render briefly with no token
  on a forced logout. Consider a route-level guard (Day 20 a11y/quality
  or Day 25 security round).
- Explore (posts and hashtags) aggregates the last 7 days on every
  request (~5.7k rows read at the perf seed). Fine now; at real scale
  precompute it (a table refreshed by the cleanup job) -- Phase 2.
- Performance: e2e/day27-perf.cjs must stay green; new list queries get
  an index (check with the suite). Any new index goes in the migration,
  the fixture AND the rehearsal compares them. npm run check:bundle
  keeps the first download under 225 kB gz.
- Privacy Policy (legal.privacy in the locales) is written from the
  code: when a feature changes what is collected, shared or kept,
  update it (EN/MY/AR) and its date in LegalScreen.jsx.
- Accessibility: e2e/day26-a11y.cjs must stay at 0 serious/critical.
  Accent colour as TEXT uses --color-accent-text (lighter in dark mode),
  never --color-accent.

- Day 30 Privacy Policy: mention that the server fetches linked pages
  for previews (sites see our server, not the reader) and that share
  cards show public posts to link-preview crawlers.

## Plan
Day 30: deploying is an owner action (LATER #2); the owner-free part
is AUDIT_REPORT_2 N1, N4, N2.
Step 1 (N1): components/auth/RequireAuth.jsx -- no token -> <Navigate
to="/login" replace state={{ from }}> (router state, not a URL param, so
no open redirect; from must start with a single /). Wrap the account-only
routes: /menu, /settings and its sub-screens except /settings/language
(logged-out language pick is supported since Day 16), /saved,
/create-post, /edit-profile, /notifications, /messages/*, /admin,
/groups, /groups/new, /groups/:id/manage, /pages, /pages/new,
/pages/:id/edit. Public browsing stays open: /posts/:id, /profile/:id,
/pages/:id, /hashtag/:tag, /groups/:id, /explore, /search, legal, auth
screens, /verify-email/:token. Login returns to that page after logging in
(a reactivation still goes Home for its banner). Also fixes the Day 16
note: a forced logout on a protected screen now lands on /login.
Tests: Vitest (guard, safe return path), browser suite day30-guard.

## Progress
- Step 1 done: RequireAuth on 22 routes, safeReturnPath, Login returns
  to the saved page. Vitest 70/70 (guard + return path; always-render
  mutation caught). day30-guard 9/9 (22 routes -> Login with 0 x 401,
  14 public stay open, return after login, revoked session -> Login).
  backend 578/578; a2, b9, b11, b12, b13, b14, c2, c3, day5, day8 x2,
  day12-review, day16 green.
- Step 2 done: removed PostContent.jsx and src/assets/{hero.png,
  react.svg,vite.svg} (nothing imported them); stale comment fixed.
  lint, build, bundle 213.9 kB, Vitest 70/70, backend 578/578, a2, b9,
  a3 EN green.
- Step 3 done: caught it in run 3 of 4: botProtection.test.js forged a
  token by replacing the signature's last char with A -- the real one
  1 time in 16 (base64 last char = 4 bits). Measured 244/4000 old vs
  0/4000 new (first char swapped). 30/30 runs of the file, 2 full runs
  578/578.
