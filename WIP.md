# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 42 — Better search
**Step:** 1 — ranked search

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

## Plan
Existing: /search/users (username ILIKE, A-Z, 20) and /search/posts
(content ILIKE, newest first) on pg_trgm indexes; Search.jsx shows both
lists; search.test.js 5. No ranking, no hashtags, no history, no filters.
Key constraint: Burmese has no spaces between words, so Postgres
full-text search alone would break Burmese search -- keep the substring
match (trigram) alongside it.
Step 1: ranked search. Migration 047: GIN index on
to_tsvector('english', content) (stemming for English; other scripts
pass through). Posts match FTS (websearch_to_tsquery) OR substring;
candidates = newest 500 matches (bounded like hashtag Top: the planner
walks created_at for common words, the GIN index for rare ones), ranked
by relevance (ts_rank_cd + whole-phrase bonus) x popularity (log of
engagement) x freshness. People: exact > prefix > contains, then people
you follow, then shorter names. Perf suite: a common word.
Step 2: hashtag search (/search/hashtags: exact > prefix > contains, use
counted up to 1000 -> "999+") and filter tabs All / People / Posts /
Hashtags with the query in the URL (?q=&type=), so Back and reload keep
them.
Step 3: search history. Migration 048 search_history (user, query,
searched_at; one row per query, newest 20 kept). POST on submit, GET,
DELETE one, DELETE all. Recent searches under the box before searching.
Data export, Privacy Policy (EN/MY/AR), account deletion cascades.

## Progress
- Step 1 done: migration 047 (GIN on to_tsvector english). Posts: FTS
  OR substring, newest 500 candidates, relevance x popularity x
  freshness (perf: q=perf matching 150k posts reads 1,061 rows / 46 ms).
  People: exact, prefix, followed, shorter; is_following returned (the
  button starts right). Fixed: % and _ were wildcards in search
  (utils/escapeLike, now shared with groups/pages). searchRanking.test
  12 (12 mutations caught), day42-search 6. backend 666/666.
- Step 2 done: /search/hashtags (migration 048 trigram on LOWER(tag);
  exact, prefix, by use; public posts only, count capped at 500 -> 500+;
  7 mutations caught). Search tabs All/People/Posts/Hashtags in the URL
  (useSearch hook; button never disabled, newer query wins; Load more).
  Search.test 7 (7 caught), day42-search 10, a11y +2 routes. Found and
  fixed: (1) trending planned a full post_hashtags scan when the table
  is not freshly vacuumed -- LATERAL ... OFFSET 0 lookup per recent post;
  (2) Following button contrast 4:1 (template purple) -> brand accent.
  backend 670/670, Vitest 110/110, perf 38/38.
