# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 36 — Profile upgrade
**Step:** 3 — pinned post (steps 1-2 committed d969bbc, 17f1a89)

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
- Explore (posts and hashtags) aggregates the last 7 days on every
  request (~5.7k rows read at the perf seed). Fine now; at real scale
  precompute it (a table refreshed by the cleanup job) -- Phase 2.
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

## Plan
Day 36 in 3 steps: (1) joined date + links, (2) cover photo, (3) pinned
post. None existed.
Step 3 (pinned post, like Facebook -- one): migration 045
users.pinned_post_id FK posts ON DELETE SET NULL + partial index (post
delete must not scan users). PUT /profile/pinned-post {postId}: only your
own post that shows on your profile (not group/page posts) else 404;
DELETE unpins. GET /users/:id/posts?tab=posts: page 1 returns pinned
separately (if the viewer may see it -- same visibility rules; an Only me
pin only for its author), the list excludes it (keeps index order, no
duplicates). UI: Pinned label on top; Pin to profile / Unpin in own
post menus on your profile. Export: pinned_post_id. Tests: jest, e2e
day36-pinned.
Step 2 (cover photo): migration 044 users.cover_url. PUT /profile/cover
(multipart cover, image filter, 5 MB, folder covers) and DELETE
/profile/cover. Old file deleted on replace/remove; mediaOfUser includes
it (account deletion); orphan scan: covers folder + users.cover_url
(else covers would be deleted!). Returned by /profile/:id, /me, export.
UI: banner on the profile (3:1, srcset, avatar overlapping); Edit Profile
has Cover photo with Change/Remove (saved at once, pending/error). Privacy
Policy section 1 lists links and cover photo. Tests: jest, e2e
day36-cover.
Step 1: migration 043 users.links TEXT[] (<= 3, CHECK). PUT /profile
takes links (JSON array in the form; absent = unchanged, so older clients
don't wipe them): http(s) only, "example.com" -> https://, <= 200 chars,
no credentials, host with a dot, deduped; else 400. GET /profile/:id and
/me return links (public like the bio); export includes them. UI:
profile shows links (hostname, target=_blank rel=noopener noreferrer
nofollow ugc, checked again with safeHttpUrl) and "Joined <month year>"
(new formatDate style monthYear, Burmese fallback); Edit Profile: up to
3 link fields. EN/MY/AR. Tests: jest (normalize, refuse, keep when
absent, public), Vitest (formatDate monthYear, links render),
e2e day36-profile.

## Progress
- Step 1 done: migration 043 users.links; utils/profileLinks.js (http(s)
  only, scheme added, host:port kept, no credentials, <= 3); PUT /profile
  links (absent = unchanged). ProfileDetails (safeHttpUrl again,
  rel=noopener noreferrer nofollow ugc, dir=ltr) + Joined <monthYear>;
  Edit Profile link fields. A first test let javascript://host pass the
  mutation -- strengthened. profileLinks.test.js 6, ProfileDetails 5,
  day36-profile 15. backend 618/618, Vitest 89/89, rehearsal 015->043.
- Step 2 done: migration 044 users.cover_url; PUT/DELETE /profile/cover;
  old file deleted on replace/remove and with the account (mediaOfUser);
  orphan scan knows covers (folder + column; both mutations caught).
  CoverPhoto (3:1 banner, srcset, avatar overlaps) on the profile; cover
  section in Edit Profile. Privacy Policy sections 1 and 7 mention cover
  photo and links (date 2026-10-06); c2-legal/b16-rtl now read the date
  from LegalScreen.jsx (e2e/legal-dates.cjs) instead of pinning it.
  coverPhoto.test.js 5, CoverPhoto 2, day36-cover 11. backend 623/623,
  Vitest 91/91, rehearsal 015->044.
- Step 3 done: migration 045 users.pinned_post_id (SET NULL + partial
  index); PUT/DELETE /profile/pinned-post (own, on-profile posts only);
  posts tab page 1 returns pinned separately (visibility applies), list
  excludes it (exclusion mutation caught). Pinned label + Pin/Unpin in
  own posts tab. pinnedPost.test.js 7, PostMenu +3, day36-pinned 11.
  backend 630/630, Vitest 94/94, rehearsal 015->045, perf 30/30
  (/users/:id/posts reads 5 rows). (PLAN was written after the first
  BUILD edits this step -- caught up before testing.)
