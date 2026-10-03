# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 19 — Link previews + share cards
**Step:** — (both steps done; Day close pending)

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
- Internet drops break suites via Google Fonts errors: re-run the batch.

## Plan
Day 19 Step 1 — link previews in posts and messages.
- Found: URLs in posts/comments/messages aren't even clickable (only
  #tags/@mentions are). Part of this step: http(s) URLs become links
  (safeHttpUrl, target _blank, rel="noopener noreferrer nofollow ugc").
- Backend services/linkPreviewService.js (no new dependency):
  - SSRF guard: http/https only, ports 80/443 only, no credentials in
    the URL; DNS resolved by us and EVERY address must be public (no
    loopback/private/link-local/CGNAT/multicast/reserved, v4 + v6 incl.
    v4-mapped); the connection is pinned to the checked IP (no DNS
    rebinding); redirects followed by hand, max 3, each re-checked.
  - Limits: 5 s total, 512 KB max read, text/html only.
  - Parse og:title/og:description/og:site_name (+ twitter:, <title>,
    meta description); decode entities; trim (title 200, desc 300).
  - Cache: table link_previews (migration 034; url_hash PK, url, title,
    description, site_name, ok, fetched_at): ok 7 days, failure 1 h;
    the Day 9 cleanup job prunes rows > 30 days.
- GET /link-preview?url=… (auth, per-user limiter) → { url, title,
  description, siteName } or 204 (nothing usable).
- Decision: NO remote preview images. Hot-linking og:image would leak
  every viewer's IP to third-party sites and widen the CSP; an image
  proxy is possible later. Text card with the domain.
- Frontend: LinkPreview card (first URL in the text) under post text
  (posts without media) and in text message bubbles; in-memory cache
  per page; no card on failure; dir="auto"; EN/MY/AR labels.
- Tests: SSRF guard units (all ranges, rebinding, redirects), parser,
  limits/timeouts against a local test server (test-only allow-list for
  127.0.0.1 via injected resolver), route + cache; vitest card; browser
  suite with a local stub site.

## Progress
- Step 1 DONE: link previews. Verified: backend 516/516 (linkPreview 59
  tests incl. SSRF ranges, rebinding-safe lookup, redirects, size/time
  limits, cache; 10 safeguard mutations caught); vitest 50/50; rehearsal
  015→034; day19-links 16/16 + a2/b4/b9/b10/b16/day2/day12-report green.
  Also: URLs in posts/comments/messages are now clickable; the dead
  post.linkPreview placeholder was replaced.
- For the Privacy Policy task (Day 30): mention that the server fetches
  linked pages for previews (sites see our server, not the reader).
- Step 2 PLAN (OG share cards): crawlers (FB/Telegram/Viber/WhatsApp/X…)
  run no JS, so /posts/:id shows the generic SPA card.
  - Backend GET /share/posts/:id: small HTML page with og:/twitter: tags
    ("<name> on MySocialApp", text excerpt, first PHOTO, og:url = the
    frontend URL) + meta refresh/link to the app. Only for posts visible
    to the public (getVisiblePost(id, null)); hidden/missing -> generic
    card (never reveals the post exists). Everything HTML-escaped.
  - vercel.json: rewrite /posts/:id with a user-agent "has" condition
    (crawler list) to that backend URL, BEFORE the SPA catch-all; shared
    links stay on the frontend domain, people still get the app.
  - serve-dist.cjs: emulate "has" + external rewrites (proxy to the
    local API) so the dist suites test the real vercel.json; check-
    headers.cjs: the rewrite must point at the .env.production API.
  - Tests: jest (public / followers-only / private account / community /
    deleted author / page post / escaping / image), browser (dist: a
    crawler UA gets the tags, a browser UA gets the app).
- Step 2 DONE: share cards. Verified: backend 526/526 (share 10 tests;
  mutations caught except an equivalent one: post_media rows already come
  in position order via the unique index); check-headers guards the
  rewrite; day19-share 14/14 on the dist stack; day10-errors +
  day11-turnstile green with the new serve-dist.
- Day 20 note: "only me" visibility does not exist yet; when added,
  getVisiblePost (used by share cards) must hide it.
- Next: Day 19 close (full browser run in batches).
