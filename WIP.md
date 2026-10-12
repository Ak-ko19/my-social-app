# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 57 — Storage safety
**Step:** 3 — Admin > Storage: done (committed). Next: close Day 57 (full browser run, tick, Progress Log).

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
- Full browser run timing: day27-perf and the A3 matrix each need most
  of a 10-minute tool call. Run day27-perf alone, and A3 one language
  at a time (`A3_LANG=xx timeout 500 node a3-visual.cjs` on a fresh
  e2e-up.sh -- one language takes ~5 min).
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

- Bundle: first download 218.2 / 225 kB (Day 50 moved the Arabic server
  messages out). Watch it; lazy-load anything big.
- Shell gotcha: never put JS template literals (backticks) or $1 inside
  a node -e "..." or heredoc edit -- bash eats them. Use the Edit tool.


- Backend test logs go in the scratchpad, never outside the project
  (writing ../../be-run.txt was refused on Day 55).

## Plan
Audit (2026-10-12): uploads are capped at 5 MB a file (multer); media
is deleted with its content; an orphan scan exists. Nothing compresses
images, measures usage, limits a person, or warns the admin. No new
accounts: Postgres reports its own size and Cloudinary's usage API works
with the existing keys (when they're set).
- Step 1 Compression in the browser (utils/compressImage.js): photos
  larger than 2048 px on the long side, or over about 1 MB, are redrawn
  at most 2048 px and re-encoded (WebP where the browser can, else
  JPEG, quality 0.85). Not GIFs (animation), not when the result would
  be bigger. Used everywhere a photo is picked: posts, stories, avatar,
  cover, chat photos, group photo. A photo too big even after that
  still gets the server's 5 MB message.
- Step 2 Per-person limits: migration 067 media_uploads (user_id, bytes,
  kind, created_at), written after each Cloudinary upload. Limits per
  day (e.g. 100 files and 300 MB) and refused with a 429 and a clear
  message in EN/AR.
- Step 3 Admin > Storage: database size vs. the plan (Neon free 0.5 GB,
  NEON_STORAGE_LIMIT_MB env name, default 512) with the biggest tables;
  Cloudinary usage from its API (or "not configured"); uploads in the
  last 24 h and the top uploaders; a warning at 80 % and an alert at 95 %.

## Progress
- Step 1 done: utils/compressImage.js (<= 2048 px, WebP else JPEG, q 0.85;
  not GIFs; original kept if not smaller or on any error), used for
  post photos (when picked), stories, chat photos, group photo, cover,
  avatar. The composer shows "Preparing your photo…" and keeps Post /
  Save draft disabled until photos are ready (a quick tap could have
  posted without them). Verified: Vitest 254 (compressImage 5, composer
  1), backend 856, bundle 220.1, browser day57-storage (8.2 MB PNG ->
  2.5 MB WebP in real Edge), b2-media (now waits for thumbnails),
  b3-stories, b9-dm, day34-group-photo, day36-cover, day45-drafts,
  day26-a11y, A3 ar + en (288 each).
- Step 2 done: migration 067 media_uploads (ledger, 30 days), services/
  uploadQuotaService.js (rolling 24 h: 100 files / 300 MB by default;
  UPLOAD_LIMIT_FILES_PER_DAY, UPLOAD_LIMIT_MB_PER_DAY env names), checked
  in both upload paths BEFORE Cloudinary, recorded after; 429 with an
  EN/AR message (a test guards its Arabic, which check:i18n can't see);
  cleanup trims the ledger; export recent_uploads; Privacy Policy EN/AR.
  11 mutations caught. Verified: backend 862, Vitest 254, rehearsal 015
  -> 067, browser day57-storage 3/3 (limit message in the composer),
  b2-media, b3-stories, c2-legal, day28-export.
- Step 3 done: GET /admin/storage (services/storageService.js): database
  size vs NEON_STORAGE_LIMIT_MB (default 512) + 8 biggest tables;
  Cloudinary usage from its Admin API with the existing keys (credits,
  storage, bandwidth, files; cached 10 min; "not set up" / "unavailable");
  uploads in 24 h + top 5 uploaders; levels ok / warn 80 % / alert 95 %
  and warnings. Admin > Storage tab (components/admin/AdminStoragePanel:
  warnings, meters, lists, Refresh), utils/formatBytes (formatBytes,
  formatPercent; EN/AR units). 10 mutations caught. The storage test
  first timed out in the full run: a report measures the whole database
  (~0.5 s locally); Cloudinary checks now hit the service directly and
  the file has a 20 s timeout. Verified: backend 868, Vitest 258, bundle
  220.5, browser day57-storage 8/8 (+ AR dark 375 axe), b12-admin,
  day12-review, day26-a11y, day30-guard, A3 ar + en (288 each).
