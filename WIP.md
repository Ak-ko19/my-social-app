# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 114-115 -- Security round 3.
**Step:** 4 of 4 -- two-factor secrets encrypted at rest. DONE (built:
secretBox, service, migration 096, env check, seal:totp script, docs,
tests; mutation check 5/5 caught; rehearsal passed; day77-two-factor
green with and without a key). Then: Day close (full browser run in
batches, Progress Log, tick the Day).
Step 4 plan:
- utils/secretBox.js: TOTP_ENCRYPTION_KEY = 32 bytes as 64 hex chars or
  base64. seal(plain, aad) -> "v1:" iv:tag:data (base64url, AES-256-GCM,
  12-byte random iv); open(stored, aad): plain text passes through as is,
  "v1:" needs the key (missing / wrong / tampered -> SecretBoxError, a
  plain 500 via sendError, logged; never "2FA off", never a bypass).
  AAD = "totp:<userId>" (same for pending and active, so enable() can
  move it): a sealed secret copied to another account won't open.
- Migration 096: totp_secret / totp_pending_secret varchar(64) -> (128)
  (a sealed 32-char base32 secret is 86 chars). Down: back to 64 (fails,
  rather than cutting, while sealed ones exist). Fixture, checklist loop,
  rehearsal.
- twoFactorService: startSetup seals the pending secret; enable opens it
  and stores totp_secret sealed (also re-seals a plain pending one);
  checkSecondFactor opens totp_secret and, after a RIGHT code with a key
  set, re-seals a plain one (conditional UPDATE ... WHERE totp_secret =
  the plain value). setup's response still returns the plain key once.
- config/env.js: TOTP_ENCRYPTION_KEY set but not 32 bytes -> refuse to
  start (error). Production without it -> a warning.
- scripts/seal-totp-secrets.js: needs the key; seals every plain secret
  (both columns) with a conditional update; prints counts; safe to re-run;
  --check counts plain ones without changing anything.
- Docs: backend/.env.example (name only + how to make one: node -e
  crypto.randomBytes(32)), GO_LIVE_CHECKLIST (set key, run script; never
  lose / change it: sealed secrets can't be read -> people use recovery
  codes), LATER.md (key rotation not built; "v1:" leaves room). Privacy
  policy: unchanged (no new data collected), checked.
- Tests: secretBox unit (round trip, AAD, tamper, wrong key, no key,
  bad key formats); twoFactor API with a key (stored value is sealed,
  setup + enable + login + disable work; plain old one re-sealed after use;
  sealed + no key -> 500 and no session; wrong key -> 500); env.test;
  script test. Mutation check on the service.
**Step 3 (done):** in-range updates x3; swagger-ui-dist 5.35.0; majors
dotenv 18, i18next 27 + react-i18next 18, motion 14, jsdom 31. Kept:
web-push 3 (4 is ESM-only: Jest's CommonJS runtime can't require it, and
3.6.7 has no advisory), myanmar-tools 1.1.3 (1.2.0 still ships no build).
The updates (and HEAD already, 225.7) were over the bundle budget: the
comments, share sheet, report dialog (post menu) and story viewer now load
on first tap via utils/lazyPart (compact ScreenLoadBoundary: offline ->
Try again + auto-retry, online -> Reload, Close if onClose): 221.2 kB.
Verified: backend 1217/1217, Vitest 470/470, lint, i18n, audit x3, 16
browser suites (day72-offline gained the offline-comments check).
Step 3 plan (as written): the lockfiles already hold the in-range updates (npm update in
all three folders, left uncommitted by the last session; package.json
untouched). Outside the ranges: swagger-ui-dist 5.33.1 -> 5.35.0 (exact
pin, no recorded reason beyond "no CDN"); myanmar-tools 1.2.0 only if its
npm package now ships its build (Day 43: it did not). Majors one at a
time, changelog read, tests run: dotenv 18, web-push 4 (backend); i18next
27 + react-i18next 18 (together), motion 14, jsdom 31 (dev) (frontend).
A major needing real rework or looking risky stays, reason logged.
Verify: backend Jest, Vitest, lint, build + check:bundle, check:i18n,
npm audit --omit=dev x3, browser smoke (incl. /docs, push, i18n).

**Steps 1+2 (done, ea6b64b):** no gaps found; securityRound3.test.js 10/10
keeps them closed. Read: replies, chat search/context, hashtag, memories,
page verification, admin. Write: story reply/react (VISIBLE_TO_VIEWER_SQL
+ send checks), share (non-text content 400; flood check), edit photos,
pinned comment, notification levels. Sockets: only 2 new server->own-room
events since Day 76. Rate limits: present or bounded on every new write.

### Plan (Days 114-115)
Since Day 76 (1a86312): 38 new routes, socketAuth reworked, new socket
events (REALTIME.md). Steps:
- **Step 1 -- read routes (the 15 GET / optionalAuth ones):** for each,
  who may read what -- blocked (both ways), private accounts, audiences
  (followers / close friends / only me), group privacy and bans, deleted
  and deactivated content, chat members who left / were removed (search +
  message context must not reach messages they can't see). Every gap gets
  a failing test first, then the fix. securityRound3.test.js holds the
  sweep (one describe per route family).
- **Step 2 -- write routes + rate limits:** ownership / role on every
  PUT/POST/DELETE (pinned comment: the post's author only; page
  verification: page admins; notification levels: members / followers
  only; story reply/react: may see the story, not blocked, message
  permission; share: may see the original, audience of a share). New write
  routes without a rate limit get one where a person could flood others
  (story replies/reactions, shares, hashtag follows, verification
  requests). Socket events since Day 76: auth + membership on each.
- **Step 3 -- dependency updates:** npm outdated in backend, frontend,
  e2e; patch/minor updates in one go, majors one at a time only when
  safe; full backend + Vitest + build + browser smoke.
- **Step 4 -- two-factor secrets encrypted at rest:** TOTP_ENCRYPTION_KEY
  (optional, 32 bytes base64/hex). Set: secrets are AES-256-GCM sealed
  ("v1:" iv:tag:data) when written, and old plain ones are read and
  re-sealed on the next use; unset: plain, as now. A wrong / missing key
  for a sealed secret = a clear server error (never "2FA off", never a
  bypass). A script seals every existing secret once a key is set
  (GO_LIVE_CHECKLIST / LATER.md: the owner makes the key). Tests both ways.

## Carry-over notes
- Days 114-115 step 3: a part of a screen that shows only after a tap
  goes through utils/lazyPart (never plain React.lazy: a failed download
  would hit the crash screen). Browser checks must WAIT for it after the
  tap (locator.waitFor / findBy; allInnerTexts() does not wait). Bundle
  221.2 / 225 kB. web-push 4+ is ESM-only (stays on 3 until Jest can load
  it); myanmar-tools stays pinned at 1.1.3.
- Jest writes nothing to a redirected log until it ends: wait for the
  "exit" line, don't read an empty file as "not running".
- Day 113 close: new-post notifications to a group / page over
  POST_FANOUT_INLINE_MAX (200) go through post_fanout_queue
  (postFanoutService.drain: ticker, cleanup, a kick after the post). A new
  rule for who hears about a group / page post goes in
  notificationService.insertNewPostNotifications (one place for both).
  A new ticker job adds a connection to scheduledPosts.test's count.
- Day 113: a statement-level trigger fires even for an UPDATE of no rows: a
  trigger that updates its OWN table must return early when nothing it
  counts changed (094 recursed to "stack depth limit exceeded"), and in
  plpgsql old_rows may only be named inside the UPDATE branch.
- Day 113: Explore reads explore_ranking (exploreRankingService; unlogged,
  rebuilt every EXPLORE_RANKING_MS, 0 = every read under NODE_ENV=test).
  A new rule for who may see a post in Explore goes in BOTH the rebuild
  (RANK_SQL) and the read's live checks. Ticker jobs open a connection each:
  scheduledPosts.test counts them. Jest's teardown STOPS the shared test
  cluster: never run Jest while a browser stack is up.
- Day 112 close: socket sign-in errors -- AUTH_FAILED only for a bad token
  or a refused session; a server/database error is a plain error so the
  app retries and keeps the session (sockets/socketAuth.js). Any new auth
  path: a database error must never become a sign-out (401/AUTH_FAILED).
- Browser checks that pass on "the screen says something" also pass on the
  login screen: check the account is still signed in (day80-states
  signedIn). Before calling a run red, read e2e/backend.log for
  ECONNREFUSED and backend/tests/.pgdata_test_cluster.log for a crash.
- Never run `run-all.sh` with an unknown flag to "see help": it runs the
  WHOLE browser suite (Day 112 slip). Stopping its Claude task does NOT stop
  run-all.sh (it kept running 75 min and broke two perf seeds by restarting
  the test DB). Look for it by `run-all` in the command line (it can be
  `e2e/../e2e/run-all.sh`, without "Mysocialapp") and kill its whole tree.
- Day 112: text in red uses --color-danger-text, never --color-accent-3
  (3.3:1 on dark; fine for icons and fills). New overlays go in
  e2e/day112-overlays (all four language x theme combinations).
- Day 113: lists that read many posts and filter on their authors use
  postVisibilityService.authorLookupSql() (author by id), never a plain JOIN
  users -- that merge-walked users_pkey (grows with every account).
- Edit profile has two role=status regions (the form and Birthday): browser
  checks look for the one with text.
- A background Jest run can start in the wrong folder: pass --rootDir.
- Days 109-110: comments come by thread (sort, replies on demand, a pinned
  one first). A new posts column used by the comment list goes in
  getVisiblePost's summary object too. Most relevant ranks every thread of
  a post per request -- Day 113.
- A browser run that fails with the offline banner everywhere or
  net::ERR_NETWORK_CHANGED is the machine's network: re-run that part.
- Backend package.json has an overrides entry (@sentry/bundler-plugins ->
  glob ^14.0.3); drop it once Sentry ships a fixed glob itself.
- Days 107-108: Home posts carry via_hashtag (the followed tag that brought
  them). A new Home source should say why a post is there the same way.
- Mutation checks: edit through a script file that counts its matches
  (shell quoting silently skipped one whose regex had a Unicode class).
- Day 106 lesson (seen twice): a hint or a character counter INSIDE a
  <label> becomes part of the field's accessible name ("Page name Changing
  the page's name..."). Put it after the label (htmlFor + id) and point
  aria-describedby at it.
- Day 106: a page's tick is pages.verified_at (PAGE_COLUMNS is_verified,
  pageColumnSql / shareService page.verified). A new place that shows a
  page's name should show NameWithTick.
- Day 105: the first download is 222.0 kB of the 225 kB budget (Home's
  cards ship with it). Day 113 (performance round 3): look for what can
  load later (e.g. the Memories and profile cards, the story viewer).
- Day 101: new-post notifications fan out inside the post request for
  small audiences; big ones are queued since Day 113 (see above).
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
- Full browser run timing: day27-perf takes ~1 min since Day 74 (it
  ends idle server connections instead of waiting 11 s each). Since Day 66 the A3 matrix and day26-a11y run in
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
- Offline (Day 72): data kept on the device goes through utils/offlineStore
  (keys offline:*, wiped by clearLocalSession) and the Privacy Policy
  section 6 must say so. Browser suites that go offline: ignore console
  errors only while offline (the first request after "online" can fail).
  The service worker only runs on the production build (DIST_SUITES).
- Check lint by its EXIT CODE (npx eslint . ; echo $?), never with | tail:
  on failure its last line is blank, like a clean run (Day 74: two lint
  errors from Day 73 went out unseen).
- Bundle 211.2/225 kB after Day 75 (React 19.3 +8.3 kB).
- Follow-up (seen Day 66): when an admin removes your post/comment/message
  nothing tells you (FB/IG notify "we removed your post"). A system
  notification type (notifySystem) -- for Day 81–82 notifications upgrade
  or the Day 85–87 buffer.

- API (Day 68): a new or changed route updates backend/docs/openapi (the
  spec test and every API test's contract check fail otherwise); a new
  socket event goes in backend/docs/REALTIME.md. Jest on several files:
  always --runInBand. Still open from Day 68: follow-counts and post likes
  echo the id as a string (the lists are paged since Day 70).

- Days 75–76 lessons:
  - A new e2e suite needs a row in e2e/README.md (ciWorkflow.test); re-run
    ciWorkflow after touching e2e/.
  - Text from a request: read it with utils/bodyText textOf(), never
    `(req.body.x || '').trim()` (an object/array crashed it).
    inputTypes.test and authSweep.test sweep every documented route.
  - A user-facing message kept in a constant must be a full sentence
    (`const X = 'Sentence ...';`) so check:i18n sees it.
  - Buttons: an aria-label must contain the visible words, whole and in
    order, in EN and AR (axe 4.14 label-content-name-mismatch).
  - Uploads are checked by their first bytes: test files need a real
    signature (PNG 89504e470d0a1a0a, JPEG ffd8ff, WebM 1a45dfa3).
  - serve-dist rewrites the production API in every header; any new
    header naming the API must not reach the live server from tests.
  - Migration 071 must run once only (a re-run decodes typed "&lt;").
  - Jest mocks a library? Check the real one by hand (sanitize-html's
    mock hid that it ate text).

- Day 77 lessons:
  - setupTestApp() closes the DB pool after its describe: ONE per test
    file (a second describe in the same file fails with "Cannot use a
    pool after calling end").
  - Browser checks right after a heading appears can race the data load:
    wait for the element (locator.waitFor), never isVisible() at once.
  - Letter-spacing on an input also spaces its placeholder: in Arabic it
    breaks joined letters -- reset it on ::placeholder.
  - A 2FA account in a test: a code works once and only +-30 s is
    accepted, so alternate an app code and a recovery code between steps.
  - Login answers can be { twoFactorRequired, challengeToken } now: any
    new client of POST /login must handle it (Login.jsx finishLogin).

- Days 78-79 lessons:
  - A NEW account's first login opens /get-started (needsOnboarding).
    Browser suites that sign up and log in through the form must expect
    it (or Skip); the e2e seed marks alice and bob done.
  - Screenshots right after a card/screen change catch the entrance
    animation (faded, offset in RTL): wait ~700 ms before judging them.
  - An i18n string with {{count}} needs plural forms (_one/_other in EN,
    all six in AR) -- "1 followers" slipped through on Day 39.
  - A non-component export from a .jsx file trips react-refresh: put
    shared helpers in utils/.

- Day 80 lesson: never start a long run with `&` inside a foreground
  Bash call -- it outlives an interruption and its e2e-down.sh kills the
  next run's database ("Connection refused" on 55433). Use
  run_in_background, and after an interruption look for leftover
  run-all/fullrun processes first.

- Day 80 notes:
  - Screens load through utils/lazyScreen (App.jsx): a new screen uses
    lazyScreen(() => import(...)), never React.lazy directly.
  - Failed loads: use FeedErrorState (offline-aware, retries by itself
    when back online); a 404 gets a way back, not Try again.
  - A new data screen: add its route to e2e/day80-states.cjs ROUTES.
  - day80-states runs as two parts (day80-states-en / -ar, ~6 min each):
    run them as their own batch.

- Days 81-82 notes:
  - Notifications are GROUPED server-side (notificationController
    GROUP_KEY_SQL): a test that counts notification rows must expect a
    group (count/actor_count). Marking one read marks its group.
  - New notification kind about something deleted: put what it needs in
    notifications.details (never a post_id to a deleted post).
  - Live events for a user: io.to(`user_${id}`) with a LITERAL event name
    (realtimeDoc.test reads them), documented in docs/REALTIME.md; the
    app listens with hooks/useSocketEvent.

- Days 83-84 notes:
  - posts.created_at (and notifications.created_at) are `timestamp`
    WITHOUT a zone, holding the database's local time (UTC on the host).
    To read one in a person's zone: (col AT TIME ZONE
    current_setting('TimeZone')) AT TIME ZONE $tz. Tests that move a post
    in time store `$instant::timestamptz AT TIME ZONE
    current_setting('TimeZone')`.
  - users.time_zone is reported by the app (TimeZoneReporter); NULL = UTC.
  - Browser suites can run a backend job in-process: set
    process.env.DATABASE_URL to the e2e DB before requiring the service
    (day83-memories).

- Days 85-87 notes:
  - New routers with integer path ids: call wholeIds(router) (middleware/
    wholeIds); inputTypes.test sweeps every documented route with bad ids.
  - Post lists: add commentCountColumnSql('$1') next to pollColumnSql.
  - Re-run `npm audit --omit=dev` in all three folders before each close:
    new advisories appear between days (two did between Days 76 and 85).

- Day 96 close: a background run "stopped for low memory" by Claude Code
  can leave its script running. Before any browser run: ps aux | grep -E
  "bash|node" -- two runs at once fail each other (ports, DB). Batches of 3.
- Day 96: the composer holds ONE ordered photo list ({ key, url } saved,
  { key, file, preview } new); forms send photos = [url | { upload: i }] +
  images + altTexts (resolvePhotos). Media cleanup deletes only
  res.cloudinary.com URLs, so browser suites can't see a file deleted.
- Days 93-94: post lists add shareService.shareColumnsSql('$1') next to
  pollColumnSql/commentCountColumnSql (shares.test lists every list). A
  correlated EXISTS over posts can be hashed over the whole table -- use a
  scalar subquery (the perf suite caught it). Never put `$1` in a JS
  String.replace replacement (it means "group 1"): pass a function.
- Day 92: a new public route needs a line in backend/docs/openapi/publicOperations.js
  (openapiSpec.test fails otherwise; c4-audit-checks reads it too).

- Day 89 notes:
  - A full run can be cut off by the machine sleeping: a suite with
    "pass 0, fail 0" and ECONNREFUSED in its out-*.txt never ran -- re-run
    it alone before calling anything red or green.
  - The audit-only suites run with `--audit` plus at least one real suite
    name (E2E_ONLY rejects "c1-seed"): `E2E_ONLY="b7-explore" bash
    run-all.sh --audit`.
