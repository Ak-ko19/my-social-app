# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 67–68 — API documentation: OpenAPI spec for every endpoint; docs page.
**Step:** Day close — full browser run in batches.

Plan (192 Express routes today; FB/X publish OpenAPI-style references
with auth, params, bodies, errors per endpoint):
- Spec as code: backend/docs/openapi/ (index.js builds an OpenAPI 3.1
  object from per-area files + shared components: User, Post, Comment,
  Message, Error...; small helpers so 192 ops stay readable).
- Can't drift: tests/api/openapiSpec.test.js walks the real Express
  router and checks, both ways: every route documented and every
  documented op exists; security = the middleware (authMiddleware ->
  bearer, optionalAuth -> optional, requireAdmin -> admin, none ->
  public); path params match; upload routes say multipart/form-data;
  every $ref resolves. While areas are being written, a PENDING list of
  route files shrinks to empty (step 5 removes it).
- Served: GET /openapi.json and /docs (swagger-ui-dist, local files, no
  CDN; CSP for that page only). On outside production; in production
  only with API_DOCS=1 (internal API -- no need to publish its map).
- Step 6: contract test (ajv): a seeded world, the main GET endpoints
  and key writes validated against their documented response schemas;
  socket events documented in docs/REALTIME.md + a test that every
  emitted/handled event name is in it; README/CLAUDE.md pointers.
Steps: 1 framework+core/auth/sessions/misc, 2 profile/users/social
graph/search/notifications, 3 posts/drafts/comments/likes/saved/
hashtags/explore/stories/events, 4 conversations, 5 groups/pages/
reports/admin (PENDING empty), 6 docs page + realtime doc.

## Progress (Day 67–68)
- Step 1 DONE: docs/openapi (helpers, components, index, areas/system +
  auth: 25 ops). openapiSpec.test (9: both ways, auth from middleware,
  multipart, path params, tags, refs; PENDING = 27 route files). BETTER
  than the plan's step-6 contract test: tests/helpers/contract.js, put
  in setupTestApp -- EVERY response of the 900 API tests is checked
  (status documented, content type, JSON schema); a mismatch fails the
  file. It found: every plain-text answer went out as text/html
  (Express default) -> server.js sends strings as text/plain (safer, and
  what the docs say). Mutations caught (schema, auth). Backend 914/914;
  journeys-safety, b15-lang, day12-report, day11-bots green; check:i18n.
- Step 2 DONE: areas/people (61 ops: profiles, following, safety,
  search, notifications, hidden words, activity) + User/Post/Poll/
  Notification schemas; op({ upload }) adds 400/429/502. Contract found
  poll_ended / poll_ended_own missing from the notification types. 914/914.
  API issues seen while documenting (for Day 69-71 code health):
  GET /users/:id/followers + /following are unpaginated (the app uses
  /connections); follow-counts echoes userId as a string.
  Idea for step 6: report documented ops no API test exercises.
- Step 3 DONE: areas/content (56 ops: posts, polls, drafts, comments,
  reactions, saved/collections, hashtags, Explore, profile tabs, stories,
  events) + PostRow/Comment/Draft/Collection/Story/Event schemas. Contract:
  0 mismatches; a mutation (Post.username int) is caught. 914/914.
  More for Day 69-71: GET /posts/:id/comments returns every comment
  (unpaginated); GET /posts/:id/likes echoes postId as a string.
  Reminder: Jest on several files ALWAYS --runInBand (one shared test DB).
- Step 4 DONE: areas/messages (21 ops: direct + group chats, text/voice/
  photo, edit, unsend, reactions, forward, read, mute) + Conversation
  Summary/Message/GroupMember schemas. 0 mismatches; mutation caught.
  914/914. Day 69-71 note: GET /conversations is unpaginated (every chat).
- Step 5 DONE: areas/groups (40 ops: groups, pages, reports, admin) +
  Group/Page/Report/AdminReport/ErrorGroup/AdminAction. ALL 192 routes
  documented; PENDING removed (test: every route documented). Contract
  found: admin_actions.id is a string (bigint), storage warnings are
  { source, level }. Mutation caught. Backend 913/913.
- Step 6 DONE: routes/docsRoutes (GET /openapi.json, GET /docs = Swagger UI
  5.33.1 from local files, script as a file under helmet CSP; off in
  production unless API_DOCS=1); docs/REALTIME.md + realtimeDoc.test (both
  ways, mutation caught); coverage report in globalTeardown -> 5 unreached
  ops got tests (apiCoverageGaps) -> 194/194 reached. Page checked in Edge:
  1280 + 375, 25 tags, no sideways scroll, 0 console errors. 924/924.
- Day close: full browser run in batches, then Progress Log + tick.

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

- e2e/README.md suite table stops at Day 5 (+ the journeys row): finish
  it in Day 69–71 (code health: update README).
