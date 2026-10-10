# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 49 — Content filtering
**Step:** 3 — spam checks: done (committed). Next: close Day 49 (full browser run, tick, Progress Log).

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
  frontend/src/i18n/serverMessages.js -- check:i18n scans the backend
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

## Plan
Instagram's "Hidden words" (a viewer's own filter, never a ban on what
people may write -- standing rule 14) plus server-side spam checks.
- Step 1 Hidden words API: migration 060 (users.hidden_words_mode
  'off' | 'warn' | 'hide', default 'warn'; user_hidden_words (user_id,
  word) cascade, max 100 words, 1-40 chars). GET /settings/hidden-words,
  PUT /settings/hidden-words/mode, POST + DELETE /settings/hidden-words.
  Data export includes them.
- Step 2 Hidden words UI: the built-in EN/AR list ships as a lazy chunk
  (no first-download cost; bundle is at 221/225 kB). One matcher
  (utils/hiddenWords.js: NFKC, lower case, Arabic diacritics / tatweel /
  alef / yeh / teh-marbuta folded, leet digits, stretched letters,
  whole-word matching with \p{L}). Applied in PostCard and comments:
  warn = covered with "Show anyway"; hide = left out. Never your own
  posts/comments. Settings > Hidden words screen (mode + your words).
  Matching on the client (decision): one matcher instead of a filter in
  every listing query, and it is a viewer preference, not security.
- Step 3 Spam checks (services/spamService.js, posts + comments, DB
  counts so they survive restarts): flood (posting too fast), the same
  text again within 10 min, the same link in too many posts/comments in
  an hour. 429 with an EN/AR message. Off under NODE_ENV=test unless
  SPAM_CHECKS_IN_TESTS=1 (as bot checks).

## Progress
- Step 1 done: migration 060 (users.hidden_words_mode,
  user_hidden_words), controllers/hiddenWordsController.js, routes
  /hidden-words (GET, PUT /mode, POST, DELETE /:word), data export,
  serverMessages AR, schema fixture + testDb, GO_LIVE_CHECKLIST (015 → 060,
  21 / 17 / 11). hiddenWords.test.js 5/5, 9 mutations all caught.
  Privacy Policy (EN/AR) now lists the words you hide. Verified: backend
  800/800, check:i18n, rehearsal 015 → 060 (up, down, rollback), browser
  c2-legal + day28-export (c2-legal first hit an Edge launch hiccup;
  re-run alone: 12/12).
- Step 2 plan (UI):
  - data/offensiveWords.js (EN + AR built-in list), loaded with
    import() only when the mode isn't off: own chunk, no first-download
    cost.
  - utils/hiddenWords.js, the one matcher: NFKC + lower case; Arabic
    diacritics, tatweel, alef / yeh / teh-marbuta / hamza-carrier forms
    folded; @/$ between letters and digits inside words read as letters
    (a$$, sh1t); stretched letters (fuuuck, شرموووطة); Arabic و/ف/ال
    prefixes; whole words and phrases (never "class" for "ass"); scripts
    written without spaces (CJK, Thai, Burmese) match inside the text.
  - context/HiddenWordsProvider: mode + your words for the signed-in
    person (cached per user in localStorage for the first paint), add /
    remove / setMode. Default context = off, so nothing changes where
    there's no provider (tests, signed out).
  - PostCard: someone else's post whose text or poll options match:
    warn = header stays, body / poll / photos / link card covered by
    "may contain words you chose to hide" + Show anyway; hide = not
    shown in lists (the post page still shows the cover: you followed
    a link to it). Comments: warn = covered with Show; hide = left out
    (their replies go with them, as buildThreads already drops orphans).
    Never your own.
  - Settings > Hidden words (/settings/hidden-words): Off / Warn / Hide
    radio group with what each does, your words (add, remove, max 100,
    40 chars), a note that the built-in list is used too.
  - Tests: matcher unit tests, PostCard + comments warn/hide, screen;
    browser suite day49-hidden-words (EN light + AR dark 375, axe).
- Step 2 done: as planned, plus: the mode changes at once and goes back
  if saving fails; the matcher is lazy-loaded with the list (first
  download 223.2 / 225 kB -- budget is tight now, +1.9 kB this step);
  the comment cover is inline-only (a test fails on DOM-nesting warnings);
  the cached words are removed on sign-out. Verified: Vitest 214, lint,
  check:i18n 1185 keys, backend 800, browser day49-hidden-words (22),
  day30-guard, day26-a11y (113 page checks), A3 ar + en (276 each),
  a2/b1/b4/b5/day44 (warn is on for everyone by default now).
- Step 3 plan (spam checks, services/spamService.js):
  - When: POST /posts and POST /posts/:id/comments (a new post or
    comment someone sends now). Not a scheduled or draft post being
    published by the ticker (the person chose that time), not edits.
  - Rules, counted from the database (they survive restarts and apply
    across server instances), each a 429 with a reason in EN/AR:
    - flood: more than 10 posts, or 30 comments, in 10 minutes;
    - the same text again: a post identical to one of yours in the last
      10 minutes; a comment identical to yours on the same post in the
      last 10 minutes ("Thanks!" on many posts is normal);
    - the same link: a link that's already in 3 of your posts/comments
      in the last hour (host + path, no www./trailing slash, any case).
  - Indexes: comments (user_id, created_at DESC) exists (059); posts
    use idx_posts_user_id (a person's recent posts are few).
  - Off under NODE_ENV=test unless SPAM_CHECKS_IN_TESTS=1 (as the bot
    checks); e2e-up passes it; a SPAM_SUITES group in run-all.sh.
  - UI: the composer and the comment form already show the server's
    message; check that they do for 429, in EN and AR.
- Step 3 progress (uncommitted): services/spamService.js, called from
  postController.createPost and commentController (after the post is
  found). spam.test.js 7/7, 15 mutations all caught. serverMessages AR.
  e2e: SPAM_CHECKS_IN_TESTS passed by e2e-up.sh, SPAM_SUITES group in
  run-all.sh, suite day49-spam. It found a real contrast bug: .form-error
  (#e11d48) was 4.4:1 on --color-bg; new token --color-error-text
  (#be123c light / #fb7185 dark). Left: rerun day49-spam (one run hit a
  dev-server timeout before any check), full backend + Vitest, a11y,
  A3, then commit.
- Step 3 done. Verified: backend 807/807 (spam 7, 15 mutations caught),
  Vitest 214, lint, check:i18n, bundle 223.5 / 225 kB, browser
  day49-spam 9/9 (one earlier run timed out loading the dev server
  before any check; re-run clean), day26-a11y (113), day30-guard, A3 ar
  + en (276 each).
