# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 27 — Performance
**Step:** 2 — responsive images + lazy loading (step 1 committed c9eb578)

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
- Accessibility: e2e/day26-a11y.cjs must stay at 0 serious/critical.
  Accent colour as TEXT uses --color-accent-text (lighter in dark mode),
  never --color-accent.

- Day 30 Privacy Policy: mention that the server fetches linked pages
  for previews (sites see our server, not the reader) and that share
  cards show public posts to link-preview crawlers.

## Plan
Step 1: seed ~1M realistic rows (e2e/day27-perf.sql), call 30 read
endpoints, FAIL on a full scan of a table over 4 MB or over 20k rows read
per request (Postgres' own counters, not timings). Fix with indexes and
query shapes. Then step 2: responsive Cloudinary sizes + lazy loading;
step 3: bundle check.

## Progress
- Step 1 found the dev fixture had NO pre-015 indexes and none from
  015/018/019/022 (snapshot was columns/constraints only). Fixture now has
  them all; the rehearsal compares indexes too (84 match) and its live
  model includes 003-014's indexes.
- Migration 039 (only what prod lacks): messages(conversation_id, id),
  post_hashtags(hashtag_id, post_id) replacing 010's, participants
  (last_read_message_id), story_views(viewer_id).
- Query shapes: inbox unread uses id > COALESCE(last_read, 0); hashtag
  page looks the tag up first and orders by post id; suggestions
  friends-of-friends is a LATERAL per-person lookup.
- Mutations: without 039 the hashtag page and inbox exceed 20k rows; the
  ASC order mutation fails hashtagPage.test.js.
- VERIFY green: day27-perf 30/30, b7, b8, b9, b10, day23, a2; backend
  570/570; rehearsal 015->039 passed.
- Step 2: ui/Avatar fetches a square crop at 1x/2x/3x of its size, lazy
  (it served full uploads before -- most avatars use it); feed images
  have a srcset 320-1440 with sizes for the 480px column; story, DM
  photo, search and admin images are sized. Tests:
  cloudinaryImage.test.jsx (5; lazy-removal mutation caught). Vitest
  65/65, eslint clean, build OK; b2, b3, b6, b9, b12, a2, day26, a3
  EN/MY/AR green; backend 570/570.
