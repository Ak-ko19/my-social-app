# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 44 — Polls
**Step:** 1 — PLAN (not started)

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
- Myanmar text (Day 43): new free-text fields people write go through
  utils/myanmarText toUnicode (check limits on the text as typed, or
  the converted text when the column is varchar), and get a row in
  scripts/convert-zawgyi.js COLUMNS (a test lists them). Hashtag /
  mention regexes are [\p{L}\p{M}\p{N}_] with the u flag on both sides.

## Plan
Like X/Facebook/LinkedIn polls. The post text is the question.
- Data (migration 050): polls(post_id PK -> posts CASCADE, closes_at),
  poll_options(id, post_id -> polls CASCADE, position, label
  varchar(50)), poll_votes(post_id, user_id -> users CASCADE, option_id
  -> poll_options CASCADE, created_at, PK(post_id, user_id) = vote once).
  Index poll_votes(option_id) not needed: counts are WHERE post_id (PK).
- Create: POST /posts with `poll` = JSON {options: [2..4 labels],
  durationHours: 24|72|168} (a JSON string in multipart). Labels 1..50
  chars after trim + Zawgyi conversion, unique ignoring case; no images
  with a poll (400); groups/pages allowed. Post + poll + options in one
  statement (like post_media) so a post never exists half-made.
- Read: pollColumnSql(viewer) next to mediaColumnSql in every post
  listing (9 queries) + GET /posts/:id: {closes_at, closed, total_votes,
  my_vote, show_results, options:[{id,label,votes|null}]}. Per-option
  counts only when show_results (voted, author, or closed) -- never
  leaked in the API otherwise.
- Vote: POST /posts/:id/poll/vote {optionId}: getVisiblePost (blocks,
  private, groups) -> 404; no poll 404; closed 409; option not in poll
  400; same vote again 200 (double tap); another option 409. Returns
  the poll. Anonymous: nobody sees who voted.
- Not editable: options/duration (X); the question (post text) is.
- Export: my votes + my polls; Privacy Policy (anonymous votes).
- UI: composer "Poll" toggle (2 option inputs, add to 4, remove,
  duration select; turns images off); PostCard PollView: options as
  buttons -> results bars (%, my vote ticked, leader bold), "N votes ·
  2 days left / Final results"; optimistic vote + rollback; keyboard,
  labels, RTL bars, dark; EN/MY/AR plurals.
- No "poll ended" notification yet: only a daily cron exists (up to a
  day late). Day 45 needs a frequent scheduler; add it there.
Steps: 1 backend (migration, create, read, vote, export + tests);
2 frontend (composer + PollView + i18n + browser suite) + policy.

## Progress
(none yet)
- Step 1 done (backend): migration 050 (polls, poll_options,
  poll_votes; PK(post_id,user_id) = vote once), services/pollService
  (parsePollInput, pollColumnSql in all 9 listings + GET, vote), POST
  /posts with `poll`, POST /posts/:id/poll/vote, export (polls + votes).
  polls.test 12 (31/31 mutations). backend 714/714, perf 38/38,
  rehearsal 015->050 (GO_LIVE_CHECKLIST: 050 in the list, 14/11/8).
  Note: Explore only lists posts with likes/comments -- votes don't
  count as engagement (left as is).
- Step 2 done (UI): composer poll builder (2-4 options, 1d/3d/1w; poll
  and photos exclude each other; empty/repeated options explained);
  PollView (options -> results bars, your vote ticked, leader bold,
  rounded "3 days left", ticks each minute; 409 refetches; logged out
  -> login); EN/MY/AR (+ all Arabic plural forms) and server messages;
  Privacy Policy (polls collected; votes anonymous). PollView.test 7
  (12 mutations), CreatePost.test 5 (7 mutations), day44-polls 16 (RTL
  bar proven on a 50% bar, axe on both states). Vitest 134/134, bundle
  218.3 kB.
