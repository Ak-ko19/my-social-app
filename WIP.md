# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 40–41 — Explore page
**Step:** 1 — Top / Recent on hashtag pages

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
- Explore: trending tags are cached 60 s in memory (Day 40, N3; off
  under NODE_ENV=test unless TRENDING_CACHE_MS is set). Popular posts
  still aggregate 7 days per request (~5.7k rows at the perf seed; per-
  viewer visibility, so not shared) -- revisit at real scale.
- Performance: e2e/day27-perf.cjs must stay green; new list queries get
  an index (check with the suite). Any new index goes in the migration,
  the fixture AND the rehearsal compares them. npm run check:bundle
  keeps the first download under 225 kB gz.
- Privacy Policy (legal.privacy in the locales) is written from the
  code: when a feature changes what is collected, shared or kept,
  update it (EN/MY/AR) and its date in LegalScreen.jsx.
- Cloudinary: a new upload folder must be added to
  scripts/cloudinary-orphans.js APP_FOLDERS (a test checks), and any new
  column holding a file URL to its referencedKeys (else the scan deletes
  it!).
- New account-only screens: wrap their route in authOnly() in App.jsx
  and add them to e2e/day30-guard.cjs GUARDED.
- Accessibility: e2e/day26-a11y.cjs must stay at 0 serious/critical.
  Accent colour as TEXT uses --color-accent-text (lighter in dark mode),
  never --color-accent.

- Day 30 Privacy Policy: mention that the server fetches linked pages
  for previews (sites see our server, not the reader) and that share
  cards show public posts to link-preview crawlers.

- Follow-up (seen Day 40): post cards never show a comment count until
  the comments are opened (PostCard comment: lists return no
  comment_count). FB/IG show "N comments" up front -- an app-wide change
  for a later polish day.

## Plan
Verified existing (B7: exploreController, hashtagController, E2E b7-explore,
explore.test/hashtag tests): trending tags (7 days, public posts only,
blocks hidden), popular posts (engagement with time decay), hashtag feed
(newest first, index walk). Gaps vs Instagram/X:
Step 1: hashtag page Top / Recent tabs. GET /hashtags/:tag/posts?sort=top
= same visibility rules, posts from the last 30 days ranked by the explore
score (shared SQL, no copy); default stays recent. Tabs (keyboard, RTL),
empty Top -> "No top posts this month" + link to Recent. Perf suite: +1.
Step 2 (N3): trending tags cached in memory for 60 s, shared by viewers
with no blocks (and logged-out); viewers with blocks keep the live query
(exact). Not a refreshed table: the daily job would leave trends 24 h
stale. Tests: cache hit, expiry, blocked viewer bypass.

## Progress
- Step 1 done: hashtag Top / Recent. Top = newest 500 visible tagged
  posts (bounded: 1,033 rows / 52 ms on #perf at the perf seed; a 30-day
  window would read the whole tag) ranked by services/popularity.js,
  shared with Explore. Tabs in ?sort=, Top default. hashtagTop.test 6
  (4 mutations caught), HashtagFeedScreen.test 3 (3 caught),
  day40-hashtag-top 7, perf +1. backend 650/650, Vitest 103/103.
- Step 2 done: trending cache (N3). Shared list for visitors and viewers
  without blocks, 60 s, concurrent misses share one query, failures not
  cached; viewers with blocks get it live. trendingCache.test 4 (6
  mutations caught). backend 654/654; b7, b8, a2, day16, perf green.
