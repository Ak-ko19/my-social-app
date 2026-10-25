# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 85–87 — Buffer: fix everything left in AUDIT_REPORT_3.md.
**Step:** 3 — ids: DONE (committed; backend 1049 incl. a new id sweep, 5 id-route browser suites). Next: 4 Arabic new-group back button.

AUDIT_REPORT_3 status: A1 (advisories, CI audit) fixed Day 60 + 75-76; A2
(Coming-soon rows) fixed Day 60; A3 (split long suites) Day 66; N1-N4
fixed; N5 (console.* in the frontend) and N6 (token in localStorage) are
info items kept for after funding. So the buffer takes the follow-ups:
1. NEW high advisories in the backend: body-parser 2.0.0-2.3.0 (DoS,
   trailing bytes after a compressed body -- express.json) and multer
   2.0.0-2.4.0 (DoS, pending fileFilter after teardown -- uploads).
   npm audit fix (in range), full backend + upload browser suites.
2. Post cards show "N comments" up front (seen Day 40): comment_count in
   every post listing (one column helper, like pollColumnSql) + the card.
3. Follow-counts and post likes echo the id as a string (Day 68).
4. Arabic: the new-group screen's back button on the left (Day 70).
5. EmailVerificationBanner amber text ~2.9:1, no dark tokens.
Then the Days' close.

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
- Bundle 211.2/225 kB after Day 75 (React 19.3 +8.3 kB).
- EmailVerificationBanner amber text ~2.9:1 (below AA), no dark tokens.
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
