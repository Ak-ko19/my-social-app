# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 20 — Posts upgrade
**Step:** — (both done; Day close pending)

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
- Internet drops break suites via Google Fonts errors: re-run the batch.

- Day 20: "only me" post visibility does not exist yet (only public /
  followers). If added, getVisiblePost must hide it (share cards, post
  pages, comments all rely on it) and feeds/profile tabs must filter it.
- Day 30 Privacy Policy: mention that the server fetches linked pages
  for previews (sites see our server, not the reader) and that share
  cards show public posts to link-preview crawlers.

## Plan
Day 20 Step 1 (multiple images): exists since B2 — verified (media +
postVisibility tests 18/18; b2-media green in Day 19's full run). Ticked.

Day 20 Step 2 — per-post audience "only me" (public/followers exist):
- Migration 035_add_only_me_visibility: chk_posts_visibility +
  'only_me'. DOWN REFUSES while only_me posts exist (the old code treats
  any non-'followers' value as public, so a plain rollback would publish
  them); its error says how to proceed (restore backup, or explicitly
  convert to followers-only first).
- API: POST /posts and PUT /posts/:id accept 'only_me' (not for page or
  community posts).
- Every read path hides it from everyone but the author:
  getVisiblePost (post page, likes, comments, bookmarks, share cards) +
  the follower clause of every listing (getPosts, /feed, profile tabs,
  explore, hashtag, search, bookmarks list).
- Mentions: notify only people who can see the post (also fixes
  followers-only posts notifying non-followers).
- Frontend: "Only me" in the audience picker (composer + edit), lock
  icon on the card, EN/MY/AR.
- Tests: a visibility matrix over every endpoint, mentions, migration
  down guard; browser suite day20-only-me.

## Progress
- Step 2 DONE: only-me. Verified: backend 537/537 (onlyMe 11 tests with
  positive controls — the first draft used two wrong routes and passed
  vacuously; 10/10 filter mutations caught after fixes); 035 down refuses
  with only_me rows, works after conversion, up idempotent; rehearsal
  015→035; day20-only-me 13/13 + b5/a2/b4/b6/b7/b15/b16/day2/day19-share.
  Also fixed: mentions in followers-only posts notified non-followers.
- Next: Day 20 close (full browser run in batches).
