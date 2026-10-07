# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 45 — Drafts + scheduled posts
**Step:** 3 — UI: done (committed). Next: step 4, poll-ended notification.

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
- FOR DAY 45: scheduled posts need a scheduler more frequent than the
  daily cleanup cron. When it exists, also send a "poll ended"
  notification (Day 44 left it out: daily would be up to a day late)
  to the poll's author (and voters, like X).
- Polls (Day 44): a new post listing must add pollColumnSql(viewer)
  next to mediaColumnSql (polls.test lists every listing).
- Burmese CONTENT (Day 43; kept after the 2026-10-07 EN/AR-only UI
  decision -- content stays any-language): new free-text fields go through
  utils/myanmarText toUnicode (check limits on the text as typed, or
  the converted text when the column is varchar), and get a row in
  scripts/convert-zawgyi.js COLUMNS (a test lists them). Hashtag /
  mention regexes are [\p{L}\p{M}\p{N}_] with the u flag on both sides.

## Plan
Better approach than "runs via the existing cron job" (daily -- can't
hit 3:15 pm): drafts AND scheduled posts live in their own table and
become real posts only when published, so no post listing needs a
"not yet published" filter (no leak risk across 9+ queries). Like
Facebook's Drafts / Scheduled lists.
- Data (migration 052; 051 is the EN/AR language change): post_drafts(id, user_id CASCADE, content,
  visibility, community_id, page_id, poll jsonb, media_urls text[],
  scheduled_for timestamptz NULL, last_error, created_at, updated_at).
  Up to 50 drafts per person.
- Create a post through ONE service (extract createPost's core:
  validation, insert post+media+poll, hashtags, mentions) used by POST
  /posts and by publishing, so a published draft gets the same checks
  AT PUBLISH TIME (still in the group? still owns the page? account
  active?).
- Step 1 drafts API: POST /drafts (form like POST /posts: content,
  visibility, communityId/pageId, poll, images), GET /drafts, GET/PUT/
  DELETE /drafts/:id (PUT keeps chosen photos, adds new ones, deletes
  removed ones), POST /drafts/:id/publish (publish now). Owner only
  (404 otherwise). A draft needs text, a photo or a poll. Photos go to
  the 'posts' folder: the orphan scan must count draft media as used;
  deleting a draft / account deletes its photos; export lists drafts.
- Step 2 scheduling: scheduled_for 5 min .. 30 days ahead. Publisher
  (services/scheduler): due drafts FOR UPDATE SKIP LOCKED, publish via
  the service, delete the draft (keep its photos, now the post's), in
  one transaction. Runs every 30 s in the server (and at start-up;
  off under NODE_ENV=test unless started) + from the daily cleanup.
  Can't publish -> back to drafts with last_error + a notification.
  Notification "your scheduled post was published".
- Step 3 UI: composer "Save draft" / "Schedule" (date-time picker,
  local time, shown back in local time); Drafts screen with Drafts /
  Scheduled tabs: open in composer (?draftId=), publish now, delete,
  reschedule; EN/AR (RTL); browser suite.
- Step 4: "poll ended" notification (Day 44 carry-over) via the same
  ticker: polls closed since the last run, once (polls.ended_notified).

### Step 2 plan (scheduling)
- API: POST/PUT /drafts take scheduledFor (ISO; '' = not scheduled; PUT
  without it keeps the current time). PUT /drafts/:id/schedule
  { scheduledFor | null } to reschedule/unschedule from the list. 5 min
  .. 30 days ahead. A scheduled draft must be publishable NOW (same
  checks as publishing) so mistakes show at once, not at 3:15 pm.
- Publisher (services/scheduledPostService): due rows FOR UPDATE SKIP
  LOCKED, one per transaction, up to 25 per run, via the same
  publishRow as POST /drafts/:id/publish. Banned / suspended /
  deactivated author or a failed check -> back to drafts (scheduled_for
  NULL, last_error) + notification. An unexpected error -> rollback,
  log, stop this run (retried next tick).
- Runs: every 30 s in the server + once at start (off under
  NODE_ENV=test), and from the daily cleanup (dry run counts due ones).
- Notifications: system types scheduled_post / scheduled_failed, about
  your own content (actor = you), always on; push EN/AR; Notifications
  screen texts EN/AR.
- Tests: validation, due vs not due, failure paths, concurrency (two
  runs -> one post), cleanup, notifications + push text.

## Progress
- Step 1 (drafts API) done: migration 052, postCreationService (POST /posts
  and publishing share it), /drafts CRUD + publish, orphan scan, export,
  account/group/page deletion media, Privacy Policy (EN/AR), Arabic
  server messages. Review fixes: group/page id 0 was skipped as "none"
  (now 403), keepMedia duplicates, check:i18n resolves imported
  constants. Verified: backend 733/733 (drafts 16), rehearsal 015-052,
  8 post-creation browser suites + c2-legal, Vitest 141.
- Step 2 (scheduling) done: scheduledFor on POST/PUT /drafts + PUT
  /drafts/:id/schedule (5 min..30 days, must be publishable now);
  scheduledPostService (SKIP LOCKED, one per transaction, 25 per run,
  30 s ticker + start-up + daily cleanup); bad account / failed check
  -> back to drafts with last_error; system notifications
  scheduled_post / scheduled_failed (push + UI, EN/AR). check:i18n now
  reads double-quoted messages: 7 older ones got Arabic. Verified:
  backend 745/745 (scheduledPosts 12, 4 mutations), Vitest 143, live
  stack: published 28 s after due.
- Step 3 (UI) done: composer Save draft / Schedule for later (local
  time + zone hint; range checked in the app language, no native
  min/max/required bubbles) / open a draft (?draftId) with its photos;
  /drafts screen (Drafts / Scheduled tabs, post now, edit, change time,
  move to drafts, delete with confirm, failure reason translated); Menu
  row; push for a failed one opens /drafts. Native file pickers on
  CreatePost and EditProfile showed browser-language text: now
  translated buttons. Verified: Vitest 159, backend 746, day45-drafts
  27/27, A3 EN+AR 234 each, a11y 95 page checks, guard, b2/a2/day44.
  Known: the date-time picker's own format follows the browser locale.
