# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 37-38 — Friends (mutual follows)
**Step:** 2 — frontend: connections screen, mutual friends, Follow back (step 1 committed c260c7b)

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

## Plan
Verified existing: send/accept/decline/cancel = follow requests (private
accounts; cancel = unfollow while pending). Better approach (Quality bar
9): friends = mutual accepted follows (Instagram/X mutuals) on the one
graph that privacy/feeds/blocks already use, not a second relationship.
Step 1 (backend): GET /users/:id/connections?type=friends|followers|
following&page&limit -> {users:[{id,username,avatar_url,is_following,
follows_you}], hasMore}; same access rule as followers (private ->
followers only, block/deactivated -> 404); excludes deactivated users and
anyone blocked with the viewer. GET /users/:id/mutual-friends -> {count,
sample (3)}: viewer's friends who are also the target's friends; same
access rule; [] for yourself/logged out. follow-counts adds friendsCount;
all counts and the old lists skip deactivated accounts (they were
shown/counted -- contradicts "hidden"). Tests: jest.
Step 2 (frontend): GET /profile/:id adds follows_you. FollowButton
(Follow / Follow back / Requested / Following, pending + error).
/profile/:id/connections?tab= (public like profiles; private ->
explanation): Friends/Followers/Following tablist (arrow keys), rows link
to profiles, Load more, empty states. Profile counts become links; "N
mutual friends · names" for logged-in viewers; profile button says
Follow back. EN/MY/AR (+ plurals), dark, RTL. Tests: Vitest
(FollowButton), e2e day37-friends.

## Progress
- Step 1 done: FRIENDS_OF subquery (both follows accepted, active
  users); GET /users/:id/connections (friends|followers|following, A-Z
  pages, is_following/request_pending/follows_you, blocks+deactivated
  excluded); GET /users/:id/mutual-friends {count, sample 3};
  follow-counts adds friendsCount; old lists/counts skip deactivated.
  friends.test.js 8 (one-way-friend + deactivated-count mutations
  caught); perf suite +3 endpoints (33/33). backend 638/638.
- Step 2 done: profile follows_you; FollowButton + utils/followLabel
  (Follow back); ConnectionsScreen /profile/:id/connections (public,
  tablist w/ arrows, Load more, private explanation); profile counts are
  links; "N mutual friends: names"; followers/friends counts now plural
  ("1 follower" was "1 followers"). a11y audit covers the new screen (92
  checks). FollowButton.test 4, day37-friends 15. backend 639/639,
  Vitest 98/98.
