# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 77 — Account safety: login alerts (new device), suspicious login slowdown, 2FA with an authenticator app (TOTP).
**Step:** 3 — 2FA backend: DONE (committed). Next: 4 the login code step (backend).

2FA plan (FB/IG: authenticator app, QR + key, recovery codes, a second
login step): steps 3 backend TOTP (utils/totp.js: RFC 6238, HMAC-SHA1,
30 s, 6 digits, +-1 step, a used step never accepted twice) + migration
073 (users.totp_secret / totp_pending_secret / totp_enabled_at /
totp_last_step; recovery_codes(user_id, code_hash sha256, used_at)) +
API: GET /2fa, POST /2fa/setup {password} -> {secret, otpauthUrl, qr
(SVG data URL, built on the server: npm qrcode, no frontend bundle)},
POST /2fa/enable {code} -> 10 recovery codes (shown once), POST
/2fa/disable {password, code|recoveryCode}, POST /2fa/recovery-codes
{password}; 4 login: right password + 2FA on -> {twoFactorRequired,
challengeToken (JWT, 5 min, purpose totp, no session)}; POST
/login/2fa {challengeToken, code|recoveryCode} -> session + login alert;
wrong codes slowed like passwords (botProtection per account) + limiter;
5 Settings > Two-factor screen (set up with QR, codes, turn off); 6 the
login code step (and "use a recovery code"). Secret stored as is (no new
key allowed); LATER: encrypt with a key the owner sets.

Step 3 refinements (PLAN, 2026-10-22):
- Wrong codes: counted IN THE DB (users.totp_failures + totp_failures_since,
  atomic UPDATE) so it holds across instances/restarts: 10 wrong codes in
  15 min -> 429 until the window ends (6 digits x3 steps: ~0.3%/day at
  most for someone who already has the password). Applies to enable,
  disable and (step 4) the login step. Success resets it.
- A used step is refused (UPDATE ... WHERE totp_last_step < step: two
  parallel requests can't both use one code). Recovery codes: one atomic
  UPDATE ... used_at IS NULL; 10 codes "xxxxx-xxxxx" (50 bits), sha256.
- Setup again before enabling replaces the pending secret; setup when on
  -> 409. Turning on/off emails the owner (security change, en/ar) when
  email is set up. The secret never leaves the server after setup and is
  never in the export (export: enabled_at + recovery codes left).
- Routes /2fa, /2fa/setup, /2fa/enable, /2fa/disable, /2fa/recovery-codes
  (auth + accountActionLimiter), new controllers/twoFactorController.js +
  services/twoFactorService.js; spec in areas/auth.js; AR server messages.

## Progress (Day 77)
- Step 1: migration 072 (known_devices + notifications.device), services/
  loginAlertService (after a successful login; never fails it; email not
  awaited), notifySystem 'new_login' + push (opens /settings/sessions) +
  email (en/ar), cleanup prunes 180-day-old devices, export includes them,
  spec documents new_login/device. UI: "New login to your account from
  Safari on iOS..." + "Check your devices". Privacy Policy section 8
  (EN/AR, 2026-10-21). Checklist 015 -> 072 (counts 29/24/16 verified on
  a fixture DB); rehearsal --old passed. loginAlerts.test (6), Vitest
  +2, new browser suite day77-login-alert (13). Backend 995, Vitest 320;
  journeys-core/-safety, day8 x2, c2-legal, day60, b11, a2, day5, day28
  green.
- Step 2: the slowdown exists and is tested (botProtection.test: 1-8 s
  per-account waits, forgetting, parallel cap, HTTP; e2e day11-bots).
  Ticked as verified, no code. (In-memory per instance: noted already
  for the Redis-after-funding item.)
- Step 3 (DONE; backend 1006, rehearsal --old passed, checklist counts 30/30/16 on a fixture DB): utils/totp.js (RFC 4226/6238 vectors pass),
  migration 073 (+ fixture, testDb, checklist 30/30/16), services/
  twoFactorService + controllers/twoFactorController + routes/
  twoFactorRoutes (mounted after sessionRoutes), npm qrcode 1.5.4 (exact),
  emails twoFactorOn/Off (en/ar), spec (tag Two-factor, 3 schemas), AR
  server messages, export profile.two_factor_enabled_at,
  tests/api/twoFactor.test.js (11 pass). For step 5: Privacy Policy
  line (key + hashed recovery codes kept while 2FA is on); CSP img-src
  must allow the data: SVG QR. For the Day's log: the key is stored
  unencrypted (encrypting needs a key the owner sets -- note in log).

Plan: 1 login alerts (new device); 2 suspicious login slowdown -- exists
since Day 11 (per-account 1-8 s waits, parallel cap, per-IP limit):
verify it's tested, extend only if a gap shows; 3 2FA with an
authenticator app (TOTP, RFC 6238 on node crypto; enroll with QR +
manual key, confirm code, recovery codes, login second step, disable).

Step 1 plan: no IPs are stored (Privacy Policy), so a "device" = what the
Sessions screen shows: browser + OS + phone/desktop (describeDevice).
Sessions are deleted a day after logout, so migration 072 adds
known_devices (user_id, device_key, last_seen_at; 180 days, pruned by
the cleanup job) and notifications.device jsonb (the alert keeps its
wording). After a successful login: if the account has known devices
and not this one -> notifySystem 'new_login' (always on: security), a
push, an email when a provider is set (emailText en/ar); then record the
device. First device ever: no alert. UI: "New login on Chrome · Windows"
+ "Check your devices" -> Settings > Sessions; EN/AR. Privacy Policy:
the kept device kinds (180 days). Tests: first login none, same device
none, new device one (+push, +email), after 180 days alerts again.

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
