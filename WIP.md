# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 69–71 — Code health: duplicated logic, large files, consistent errors, README + CLAUDE.md.
**Step:** 8 — root README.md + CLAUDE.md: PLAN.

Plan (survey: biggest file 735 lines; the real debt is duplication):
1. utils/httpError.js: HttpError(status, message) + sendError(res, err,
   fallback). The 19 error classes extend it (names kept); the 6 local
   handle() helpers and the 29 instanceof chains in conversationController
   go; sockets derive message_error codes from the status. Same statuses
   and messages (the frontend translates messages) -- the contract check
   proves no response changed.
2. Block-check SQL (32 copies) -> one blockService helper.
3. Unbounded lists from Day 68 (followers/following, comments,
   conversations): bound them, frontend included.
4. Split useConversationMessages.js (735 lines).
5. Root README.md + CLAUDE.md up to date (its feature list is stale).

## Progress (Day 69–71)
- Step 1 DONE: utils/httpError (HttpError + sendError); 15 error classes
  extend it (names kept); 4 local handle() helpers, 29+ instanceof
  chains and 6 inner try/catch wrappers gone; every controller/route
  catch-all is sendError; sockets read the code from the status. Only
  override: NotEditableError 409 for reactions/forward. Chains that
  missed a class (500 before) now answer its status. httpError.test (16,
  incl. a guard against the old pattern). Backend 940/940, contract
  194/194; b9-dm, day31/32/47, day49-spam green; check:i18n. -127 lines.
- Step 2 DONE: blockService.noBlockBetweenSql(a, b) replaces 24 copied
  two-way block checks (script parsed each, mirror verified). One-way
  mutation caught by 11 tests in 10 files. Backend 940/940, perf 41/41,
  journeys-safety, day47, b7, b8, day42 green.
- Step 3 DONE: the unpaginated GET /users/:id/followers + /following are
  removed; /connections gained q (username filter, LIKE-escaped); the
  group-member picker pages (100) + searches on the server + Load more
  (members.noMatches EN/AR); tests and e2e moved to /connections. Backend
  941/941 (192 ops, all reached), Vitest 281, lint, i18n, bundle 222.2;
  b8, b10, day33, journeys-social, perf green; AR dark 375 checked.
  To look at later: in Arabic the new-group screen's back button sits on
  the left (pre-existing; check what the other headers do).
- Step 4 BUILT: GET /posts/:id/comments -> { comments, nextCursor }, oldest
  first, cursor = last id (created_at is µs, a JS Date only ms), 50/100;
  migration 070 idx (post_id, id) + fixture + checklist (rehearsal PASSED,
  56 up/down, 140 indexes); useComments loadMore (dedupe) + CommentSection
  "View more comments" (EN/AR); b4 checks 55 comments in EN/AR. Backend
  943, Vitest 283, bundle 222.5; b4, day12, day43, day47, day58,
  journeys-core green; perf 41/41. STEP DONE.
- Step 5 DONE (BUG FIXED): message history skipped messages sent in the
  same millisecond at a page edge (proved: m2, m3 of 5 never came). The
  cursor is now the id; the query reads that row's own (created_at, id).
  Old cursors still work; another chat's cursor finds nothing.
  messageCursor.test (3). Backend 946/946; a2, b9, day32, journeys-core,
  perf green.
- Step 6 DONE: GET /conversations -> { conversations, nextCursor } (20/50),
  page picked first (activity keyset by id in SQL), details only for the
  page; ?q= (group name / other username), ?id= (one chat; the chat header
  uses it instead of fetching the whole inbox). Inbox Load more; forward
  sheet searches on the server (picks keep their names). inboxPaging.test
  (3), hook + ForwardSheet tests, b9 checks 22 chats (list is virtualized:
  counted by index). Backend 949, Vitest 286, bundle 222.6; a2, b9, b10,
  day23, day32, journeys-core/social, perf green.
- Step 7 DONE: useConversationMessages 735 -> 494 lines; utils/chatMessages
  (pure helpers, 60) + hooks/useMediaMessages (voice + photo, 133: one
  shared upload routine and one retry, instead of two copies). Same API.
  New tests: chatMessages (3), useMediaMessages (2). Vitest 291, lint,
  bundle 222.6; a2, b9, b10, day31, day32 green.
- Next: step 8 README + CLAUDE.md, then the Day close.

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
- day27-perf takes ~8.5 min now (Day 66): split it like a3/a11y in Day 74.
- Follow-up (seen Day 66): when an admin removes your post/comment/message
  nothing tells you (FB/IG notify "we removed your post"). A system
  notification type (notifySystem) -- for Day 81–82 notifications upgrade
  or the Day 85–87 buffer.

- API (Day 68): a new or changed route updates backend/docs/openapi (the
  spec test and every API test's contract check fail otherwise); a new
  socket event goes in backend/docs/REALTIME.md. Jest on several files:
  always --runInBand. Code-health items from documenting: unpaginated
  followers/following, comments, conversations; ids echoed as strings in
  follow-counts and post likes.
- e2e/README.md suite table stops at Day 5 (+ the journeys row): finish
  it in Day 69–71 (code health: update README).
