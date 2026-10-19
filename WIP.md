# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 64–66 — End-to-end tests: Playwright tests for the 15 most important user journeys; run in CI.
**Step:** Day close — full browser run in batches. Plan: 15 journeys, each only through the UI (two people = two browser contexts), in 3 suites of 5 so each stays a few minutes: journeys-core (J1 sign up via landing + first post on Home and profile; J2 log out, log in, reload keeps you in; J3 find bob in search, follow, like + comment, bob sees the notification; J4 private account: follow request, approve, posts appear; J5 DM from profile, live both ways), journeys-social (J6 group chat; J7 photo post; J8 story seen by a friend; J9 group: create, other joins + posts; J10 page + event), journeys-safety (J11 report -> admin removes; J12 block/unblock; J13 edit profile + Arabic RTL and back; J14 change password, old fails new works; J15 delete account, cannot log in). Shared e2e/journey-kit.cjs. journeys-core joins the CI smoke list. Then step 4: AUDIT_REPORT_3 A3 split a3/a11y; step 5: e2e/JOURNEYS.md + CI test that every journey suite runs in CI.

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

- Follow-up (seen Day 66): when an admin removes your post/comment/message
  nothing tells you (FB/IG notify "we removed your post"). A system
  notification type (notifySystem) -- for Day 81–82 notifications upgrade
  or the Day 85–87 buffer.

- e2e/README.md suite table stops at Day 5 (+ the journeys row): finish
  it in Day 69–71 (code health: update README).

## Progress (Day 64–66)
- Step 1 journeys-core (J1–J5): suite + e2e/journey-kit.cjs written; added
  to run-all.sh SUITES and the CI smoke list. Bug it found: a brand-new
  direct chat wasn't live (sockets join chat rooms only on connect) --
  fixed by moving groupController's syncRooms into sockets/index.js and
  calling it from createConversation; tests/api/newConversationLive.test.js
  (mutation caught). STEP DONE: journeys-core 20/20; b9-dm, b10-groups,
  a2-walkthrough, day32-forward, day33-group-admins green; backend 886/886.
- Step 2 journeys-social (J6–J10) PLAN: J6 group chat (rana follows sami +
  tariq; New group -> both get live messages, names on bubbles); J7 photo
  post (pick a photo -> really uploaded -> shows on Home for a follower);
  J8 story (sami adds one, rana sees it in the tray, opens it, ring turns
  seen); J9 community group (create, other finds + joins, posts, creator
  sees it); J10 page + event (create page, follower follows it, event on
  the page, other says Going). Real uploads: e2e/cloudinary-stub.cjs (port
  3904) answers the SDK (CLOUDINARY_URL ?upload_prefix=, test stack only,
  no app change) and serves the file; run-all.sh MEDIA_SUITES / e2e-up
  E2E_MEDIA=1; e2e-down frees 3904; ciWorkflow helpers list.
  STEP DONE: journeys-social 17/17 (and fails without the stub, so the
  photo checks are real); journeys-core 20/20; backend 886/886.
- Step 3 journeys-safety (J11–J15) STEP DONE (76f4fbf): report -> admin
  removes (+ admin log), block/unblock, Arabic bio + app in Arabic and back,
  change password (other device out, old fails), delete account (typed
  username). 21/21, 0 console errors (kit: attemptLogIn {refusal} expects
  a 401 only then). All 3 journey suites green together; backend 886/886.
- Step 4 AUDIT_REPORT_3 A3 split a3/a11y PLAN: a3-visual gets A3_THEME
  (light|dark) -> 4 parts a3-en-light ... a3-ar-dark; day26-a11y gets
  A11Y_PART (light: EN light, dark: EN dark, ar: Arabic + keyboard). run-all
  runs each part on its own fresh stack with its own line; E2E_ONLY takes
  a3 / day26-a11y (all parts) or one part. Same checks, same totals (a3
  288/lang, a11y 125). README + WIP notes updated; ciWorkflow test that
  the parts add up to the whole.
  STEP DONE: a11y light 59 / dark 59 / ar 7 (=125, ~2 min each); a3
  en-light/en-dark/ar-light/ar-dark 144 each (=288/lang, ~4 min each);
  all 0 failures; backend 888/888.
- Step 5 e2e/JOURNEYS.md + CI test STEP DONE: doc (15 rows, run, add);
  ciWorkflow: J1..J15 in order, each has checks in its suite (mutation
  caught), every journeys suite in run-all + core in smoke. Backend 905/905.
- Day close: FULL browser run in batches of <=5 (heavy alone), then the
  Progress Log entry + tick Day 64-66.
