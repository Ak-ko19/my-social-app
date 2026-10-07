# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 43 — Myanmar text support
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

- FOR DAY 43 (Myanmar text): backend/services/hashtagService.js uses
  /#(\w+)/g -- ASCII only, so Burmese hashtags (#ရန်ကုန်) are never
  recognised; the frontend link renderer likely has the same rule. Fix
  with Unicode letters/marks (\p{L}\p{M}\p{N}_, u flag) on both sides.

- Edit/Write tools can DECODE \uXXXX escapes in code you write (Day 43:
  a regex /[က-႟]/ landed as literal Burmese). After writing
  such code, check with `grep -n ... | od -c`; to fix, build the
  backslash with String.fromCharCode(92) in a script.
- Full browser run timing: day27-perf and the A3 matrix each need most
  of a 10-minute tool call. Run day27-perf alone, and A3 one language
  at a time (`A3_LANG=xx node a3-visual.cjs` on a fresh e2e-up.sh).

## Plan
Library: Google's myanmar-tools (Apache-2.0, offline) PINNED 1.1.3 --
1.2.0 on npm is broken (index.js requires a missing build_node/).
Measured on its own paired corpora: every Zawgyi line >= 0.992, every
Unicode line <= 0.001; conversion matches 152/154 lines. Converting
Unicode by mistake corrupts it (မင်္ဂလာပါ -> မင်ျဂလာပါ), so convert
ONLY when P(Zawgyi) >= 0.95, per line (a pasted Zawgyi paragraph inside
Unicode text); short/ambiguous text (က = 0.48) is left as is.
Convert on WRITE (server): storage, search, hashtags, mentions and
notifications all see Unicode whatever font the writer has. Not
usernames (identifiers: rewriting one silently breaks finding/mentioning).
Step 1: utils/myanmarText.js toUnicode(); posts (create/edit), comments
(create/edit), messages (sanitizeContent: text, caption, edit; HTTP +
socket), bio, group-chat names, community + page name/description.
Hashtags/mentions read the converted text. Unit tests on the corpora +
API tests per path; UI shows the server's text (check optimistic paths).
Step 2: search: q converted for users/posts/hashtags/communities/pages
and saved history.
Step 3: Burmese hashtags (carry-over above): Unicode-aware tag regex on
backend + frontend linkifier; hashtag page/route accepts them.
Step 4: backfill script for existing rows (dry-run default, --apply),
LATER.md + GO_LIVE_CHECKLIST note (owner runs it on production).

## Progress
- Step 1 done: utils/myanmarText.js toUnicode (per line; ambiguous
  lines follow the whole text, scored lazily; text > 10,000 left alone
  so work stays bounded). Posts, comments, messages (send/caption/edit,
  HTTP + socket), bio, group-chat/community/page names + descriptions,
  report details. New limits (none before), counted on the text AS
  TYPED, then converted (conversion can lengthen it): post 10,000,
  comment 5,000, bio 500 (generous: existing bios must still save).
  UI: maxLength on every one of those fields; screens now show the
  server's text after saving (comment edit, REST message edit + quotes,
  bio, page form). MY/AR for the new 400s. myanmarText.test 13 (26/26
  mutations), useComments.test 2 (1/1), day43-zawgyi 18. backend
  689/689, Vitest 118/118.
- Step 2 done: Zawgyi search queries converted -- posts, hashtags,
  groups/pages directories, saved recent searches (Zawgyi and Unicode
  are one entry). People: usernames are never converted, so the query
  matches as typed OR converted (filter, exact, prefix). 5 tests, 7/7
  mutations; day43-zawgyi 20; perf 38/38; backend 694/694.
  Noted, not fixed (pre-existing): /search/users and /search/posts 500
  on an array q (?q=a&q=b) -- .trim() on a non-string.
