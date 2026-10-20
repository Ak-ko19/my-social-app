# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 74 — Performance round 2: slow queries, caching headers, image sizes, bundle splitting.
**Step:** 1 — bundle: Motion after the first paint: DONE (saving).

Plan: 1 bundle (LazyMotion); 2 slow-query review (perf suite's slowest
+ EXPLAIN); 3 API caching headers (ETag / no-store for private data);
4 image sizes (what each upload and avatar costs); 5 split day27-perf
(8.5 min) like a3/a11y.

## Progress (Day 74)
- Step 1: framer-motion (motion 13) was 40 kB of the first download.
  LazyMotion + m.* (8 files) + utils/motionFeatures (domAnimation, loaded
  after first paint), strict. First download 223.9 -> 200.7 kB. Checked in
  the browser: the features chunk loads and the sheet animates
  (translateY 98% -> 0). Vitest 312, lint (exit 0); day58, b4, a2,
  day60, b11 green.

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations
  and checks the checklist's migration list).
- Any new migration: up + down files, update tests/fixtures/schema.sql
  (+ testDb TABLES), GO_LIVE_CHECKLIST loop, and the rehearsal must pass.
- Never chain a commit after a check without gating on its result
  (Day 55 slip: a red backend run got committed).
- Logging: use utils/logger (a test forbids console.* in backend
  sources); 500s via sendServerError so they reach the error log.
- Suites that need the production build go in DIST_SUITES (run-all.sh);
  ones that need the real bot checks in BOT_SUITES; Turnstile-on ones in
  TURNSTILE_SUITES; Day 49: ones needing the spam checks in SPAM_SUITES
  (SPAM_CHECKS_IN_TESTS=1, off for every other suite).
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
  update it (EN/AR) and its date in LegalScreen.jsx.
- UI languages = EN + AR only (2026-10-07, MONTH_PLAN rule 14). A new
  user-facing server message needs an Arabic line in
  frontend/src/i18n/serverMessages.ar.js -- check:i18n scans the backend
  (res.status().send, { error }, XxxError(status, '...')) and fails
  otherwise; developer-only texts follow its DEV_ONLY rules. New emails:
  config/emailText.js (en + ar).
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

- Edit/Write tools can DECODE \uXXXX escapes in code you write (Day 43:
  a regex /[က-႟]/ landed as literal Burmese). After writing
  such code, check with `grep -n ... | od -c`; to fix, build the
  backslash with String.fromCharCode(92) in a script.
- Full browser run timing: day27-perf needs most of a 10-minute tool
  call -- run it alone. Since Day 66 the A3 matrix and day26-a11y run in
  parts (E2E_ONLY="a3-en-light" ... "a3-ar-dark": ~4 min each, two per
  tool call; "day26-a11y-light"/"-dark"/"-ar": ~2 min each, all three in
  one call).
- Time-based work (Day 45): add a job to services/ticker.js JOBS (30 s +
  start-up; take rows FOR UPDATE SKIP LOCKED so several instances are
  safe) and to cleanupService.run as the backstop.
- Notifications about your own content (no other actor):
  notificationService.notifySystem / SYSTEM_TYPES, pushText (en+ar), and
  a key in Notifications.jsx notificationKey + notifications.types.
- Native browser controls speak the BROWSER's language (file picker
  text, required/min/max bubbles): use translated buttons and our own
  checks (Day 45: CreatePost, EditProfile).
- New ways to create a post go through services/postCreationService.
- Saved-post listings use services/savedPostsService (one visibility
  query). Arabic: a collection is "قائمة"; "مجموعة" means a group.
- Who may see a post: postVisibilityService.getVisiblePost (one post)
  and postAudienceSql (listings) -- never copy the audience rule. Muted
  (muteService.notMutedSql) applies to Home/stories/Explore only;
  restricted people never notify (notify(), mentions, pushes).
- Direct-message rules live in messageService.assertNotBlocked (every
  send) + interactionService; a new send path must call it.
- Never put a commit in the same batch as the checks it depends on.
- Browser runs: ONE run-all/A3 at a time -- two in parallel fail with
  "run-all.sh: No such file" (seen twice on Day 47).
- Polls (Day 44): a new post listing must add pollColumnSql(viewer)
  next to mediaColumnSql (polls.test lists every listing).
- Burmese CONTENT (Day 43; kept after the 2026-10-07 EN/AR-only UI
  decision -- content stays any-language): new free-text fields go through
  utils/myanmarText toUnicode (check limits on the text as typed, or
  the converted text when the column is varchar), and get a row in
  scripts/convert-zawgyi.js COLUMNS (a test lists them). Hashtag /
  mention regexes are [\p{L}\p{M}\p{N}_] with the u flag on both sides.

- Full browser run: run it in batches of about five suites
  (`E2E_ONLY="a b c d e" bash run-all.sh`), not all at once. The
  machine ran low on memory during a one-shot run on Day 48.

- Day 49: suites that need the spam checks go in SPAM_SUITES
  (SPAM_CHECKS_IN_TESTS=1); every other suite posts freely.
- Hidden words is on (warn) for every account by default: test content
  with words from frontend/src/data/offensiveWords.js gets covered.

- Bundle: first download 220.5 / 225 kB (Day 50 moved the Arabic server
  messages out). Watch it; lazy-load anything big.
- Shell gotcha: never put JS template literals (backticks) or $1 inside
  a node -e "..." or heredoc edit -- bash eats them. Use the Edit tool.


- Backend test logs go in the scratchpad, never outside the project
  (writing ../../be-run.txt was refused on Day 55).

- A picked photo now shows after it is shrunk (Day 57): browser suites
  must wait for .image-picker-item before checking the composer.

- Browser tests that upload photos for real: put the suite in
  run-all.sh MEDIA_SUITES (E2E_MEDIA=1, e2e/cloudinary-stub.cjs on :3904).
  A new user journey: a J<n> row in e2e/JOURNEYS.md and checks named
  "J<n> ..." (ciWorkflow.test checks both).
- Lists are cursor-paged by id (comments, messages, inbox): never put a
  timestamp from a JS Date in a cursor (it drops microseconds; Day 70 bug).
  Errors: throw an HttpError subclass, end handlers with sendError.
  Two-way block checks in SQL: blockService.noBlockBetweenSql.
- To look at (Day 70): in Arabic the new-group screen's back button sits
  on the left -- check the app's header convention in RTL.
- Offline (Day 72): data kept on the device goes through utils/offlineStore
  (keys offline:*, wiped by clearLocalSession) and the Privacy Policy
  section 6 must say so. Browser suites that go offline: ignore console
  errors only while offline (the first request after "online" can fail).
  The service worker only runs on the production build (DIST_SUITES).
- Check lint by its EXIT CODE (npx eslint . ; echo $?), never with | tail:
  on failure its last line is blank, like a clean run (Day 74: two lint
  errors from Day 73 went out unseen).
- Bundle 223.9/225 kB after Day 72 -- Day 74 must make room.
- EmailVerificationBanner amber text ~2.9:1 (below AA), no dark tokens.
- day27-perf takes ~8.5 min now (Day 66): split it like a3/a11y in Day 74.
- Follow-up (seen Day 66): when an admin removes your post/comment/message
  nothing tells you (FB/IG notify "we removed your post"). A system
  notification type (notifySystem) -- for Day 81–82 notifications upgrade
  or the Day 85–87 buffer.

- API (Day 68): a new or changed route updates backend/docs/openapi (the
  spec test and every API test's contract check fail otherwise); a new
  socket event goes in backend/docs/REALTIME.md. Jest on several files:
  always --runInBand. Still open from Day 68: follow-counts and post likes
  echo the id as a string (the lists are paged since Day 70).
