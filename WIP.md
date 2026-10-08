# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 47 — Privacy controls
**Step:** 3 — close friends: done (committed). Next: step 4, who can message / comment.

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
- Polls (Day 44): a new post listing must add pollColumnSql(viewer)
  next to mediaColumnSql (polls.test lists every listing).
- Burmese CONTENT (Day 43; kept after the 2026-10-07 EN/AR-only UI
  decision -- content stays any-language): new free-text fields go through
  utils/myanmarText toUnicode (check limits on the text as typed, or
  the converted text when the column is varchar), and get a row in
  scripts/convert-zawgyi.js COLUMNS (a test lists them). Hashtag /
  mention regexes are [\p{L}\p{M}\p{N}_] with the u flag on both sides.

## Plan
Four steps, one feature each (all private: the other person is never
told; EN/AR, RTL, dark, tests, browser suite each).
1. Mute a person (FB "snooze", IG "mute"): migration 055 user_mutes
   (muter, muted, created_at; PK; CHECK not self). Their posts and
   stories leave Home (/feed), the stories tray and Explore's popular
   posts; profile, search, links, groups, comments and notifications
   are unchanged. POST/DELETE /users/:id/mute, GET /muted-users,
   profile is_muted_by_me. UI: "Mute <name>" in their posts' menu (the
   post leaves the feed at once) and on their profile; Settings ->
   Muted accounts (unmute). Export + Privacy Policy.
2. Restrict (IG): their new comments on your posts are seen only by
   them and you (labelled; you can approve or delete); they can't
   notify you (comments, likes, mentions, messages). Settings list.
3. Close friends: a list (Settings) + "Close friends" audience for
   posts (visibility 'close_friends' everywhere getVisiblePost / feed
   / listings decide) and stories.
4. Who can message me (everyone / people I follow / no one new) and who
   can comment on my posts (everyone / followers / people I follow):
   Settings -> Privacy, enforced in the API (messages incl. socket,
   comments), explained in the UI.

## Progress
- Step 1 (mute) done: migration 055, muteService.notMutedSql on /feed,
  stories tray, explore popular (page posts exempt); mute API + list;
  profile is_muted_by_me; UI: post menu Mute, profile Mute/Unmute with a
  note, Settings > Muted accounts. Export + Privacy Policy. Also: names
  in the Blocked/Muted lists sat centred; now next to the avatar.
  Verified: backend 771 (mutes 6, 4 mutations), Vitest 176, rehearsal
  015-055, perf 38/38, day47-privacy, 7 feed suites, a11y 99, A3 246x2.
- Step 2 (restrict) done: migration 056 (user_restrictions,
  comments.awaiting_approval); held comments seen by author + post owner
  only (counts too), approve / owner delete, no notifications (notify,
  mentions, message pushes). UI: profile Restrict, held note + Approve,
  comment Delete (was missing from the UI entirely), Settings >
  Restricted accounts. Caught by the browser suite: postService.authHeaders
  had been rewritten into calling itself (feed crashed); fixed.
  Verified: backend 779 (restrict 7, 11 mutations), Vitest 179,
  rehearsal 015-056, perf, 12 suites, a11y 101, A3 252x2.
- Step 3 (close friends) done: migration 057 (list, close_friends
  audience, varchar(20), stories.close_friends; down = only_me / delete,
  never wider). postVisibilityService.postAudienceSql replaces 7 copies
  of the audience clause; getVisiblePost, feed, notification snippets,
  poll-end voters, stories tray follow it. API /close-friends (+
  candidates = followers). UI: composer + post menu option, green star,
  story Share-to sheet + green ring, Settings > Close friends.
  Verified: backend 787 (closeFriends 7, 8 mutations), Vitest 185,
  rehearsal 015-057, perf, 9 suites, a11y 103, A3 258x2.
