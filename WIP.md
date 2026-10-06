# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 33-35 — Group chats
**Step:** 1 — admins: make / remove admin

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
- New account-only screens: wrap their route in authOnly() in App.jsx
  and add them to e2e/day30-guard.cjs GUARDED.
- Accessibility: e2e/day26-a11y.cjs must stay at 0 serious/critical.
  Accent colour as TEXT uses --color-accent-text (lighter in dark mode),
  never --color-accent.

- Day 30 Privacy Policy: mention that the server fetches linked pages
  for previews (sites see our server, not the reader) and that share
  cards show public posts to link-preview crawlers.

## Plan
Already built (B10, groups.test.js, E2E b10-groups): create, add/remove
members, leave, rename (admins), auto-promote when the last admin leaves,
live group_updated. Missing: managing admins (step 1), group photo (step
2).
Step 1: PATCH /conversations/:id/members/:userId { role: admin|member }:
admins only (403), target in the group (404), bad role (400), never
removes the last admin (409 -- a group always has one; leaving still
auto-promotes). Self step-down allowed when another admin exists. Emits
group_updated. UI (GroupInfoScreen): on others' rows admins get "Make
admin" / "Remove as admin"; an admin's own row gets "Step down as
admin" when another admin exists. EN/MY/AR. Tests: groups admin jest
cases; e2e day33-group-admins (two people, live, dark, AR).

## Progress
- Step 1 done: PATCH /conversations/:id/members/:userId {role}
  (SET_ROLE_SQL locks the group rows: a concurrent demotion waits and
  then refuses; proven by a two-connection test -- the HTTP race test
  could not catch a missing lock, 0/10). GroupInfoScreen: one Options
  sheet per member (Make admin / Remove as admin / Remove; own row: Step
  down only while another admin exists). b10-groups updated for the
  sheet. groupAdmins.test.js 7 (guard + lock mutations caught),
  day33-group-admins 13. backend 605/605, Vitest 82/82.
