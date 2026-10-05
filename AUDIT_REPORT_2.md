# MySocialApp — Second full read-only audit

**Date:** 2026-10-05 (Day 29)
**Code audited:** branch `dev` @ `61969ae`, clean working tree, in sync
with `origin/dev`.
**Compared with:** [AUDIT_REPORT.md](AUDIT_REPORT.md) (2026-09-28, `ad09816`).

**Scope and method:**
- Read the code, the migrations and the first report.
- Re-checked every first-audit finding against its fix, with tests and
  commits as evidence.
- Used the results of the full verification of this exact commit (the
  Day 28 close, earlier the same day; no application code has changed
  since):
  - backend tests: 578;
  - frontend unit tests (Vitest): 65;
  - all 38 browser suites (659 checks);
  - the A3 visual matrix (228 page checks × EN/MY/AR);
  - the perf suite;
  - the go-live migration rehearsal;
  - `check:i18n`, `check:headers`, `check:bundle`.
- Classified all 121 HTTP routes by their auth middleware with a script.
- Ran 32 fresh API/Socket.io probes plus an SSRF listener test on
  everything added since the first audit.
- Ran `npm audit` on the production dependencies of backend, frontend and
  e2e.

No application code was changed; only this file was written. Fixes are
for Day 30.

**Assumptions and limits:**
- `.env` and the production database were not read.
- The GitHub repository is private and no GitHub CLI or token was used,
  so **CI results on GitHub could not be seen** (LATER.md #1).
- Real Cloudinary uploads, real email (Brevo), real push delivery
  (VAPID) and Turnstile need keys that only the owner can create. They're
  verified with mocks, stubs and code reading, not end to end.

---

## 1. Summary

**Overall health: the code is ready for a launch; the live site is not.**

- All 4 Critical/High code bugs and all 7 Medium/Low bugs from the first
  audit are fixed and covered by tests.
- The remaining gaps are owner actions, not code:
  - deploying;
  - keys for email, push and CAPTCHA;
  - turning on the cleanup job.

| Measure | First audit (Sep 28) | Now (Oct 5) |
| --- | --- | --- |
| Backend API tests | 233 (26 files) | **578** (52 files) |
| Frontend unit tests | 0 | **65** (11 files) |
| Browser suites / checks | 19 / 281 | **38 / 659**, plus the A3 matrix 228 × 3 languages |
| Browser suites in CI | No | Yes: a smoke run on every push, the full run on PRs to `master` |
| Probes | 32/33 (1 real bug) | **32/32**, plus 6/6 SSRF bypass attempts refused |
| Migrations | 001–027 | 001–**039**; rehearsal 015 → 039 passes, now also comparing indexes |
| `npm audit` (production dependencies) | not run | **0** vulnerabilities (backend, frontend, e2e) |
| First download (gzip) | 209.7 kB | 213.8 kB, with a 225 kB budget enforced in CI |
| i18n keys × 3 languages | 763 | 884 |

**Top 5 risks now**

1. **Production is 144 commits behind and runs the Sep 22 code.**
   - `master` = `3c5d884`, with the live database at migration 014.
   - Nothing since then is live: the security fixes (proxy rate limit,
     media deletion, sessions), reactions, stories, groups, pages,
     languages and so on.
   - Anyone shown the live site sees the old app, and it still has the
     first audit's Critical rate-limit bug.
   - This is the owner's GO LIVE (GO_LIVE_CHECKLIST.md, LATER.md #2).
     Everything for it is prepared and rehearsed.
2. **Owner-gated features are off in production until their keys exist.**
   - Each one degrades gracefully, with tests for the "off" state:
     - password reset and verification email (Brevo, LATER #3);
     - push notifications (VAPID, #7);
     - signup CAPTCHA (Turnstile, #6);
     - Sentry (#5).
   - The cleanup job (#4) is the important one: the new Privacy Policy
     promises retention periods that only hold once it runs.
3. **Protected screens render for logged-out visitors (new, Medium).**
   - `/settings/account`, `/settings/sessions`, `/create-post`, `/saved`
     and `/groups/new` show their UI to a logged-out visitor.
   - Nothing leaks: every API call needs a token. But the visitor gets a
     form that can only fail, and `/admin` makes 2 refused API calls
     before it redirects.
   - There's no route-level guard (also the Day 16 carry-over note).
4. **Single-instance design.**
   - Socket.io presence, per-conversation message limits and the
     express-rate-limit counters live in memory.
   - A restart resets the limits, and the app can't run on two instances.
   - That's fine for the free tier and the MVP; scaling needs Redis
     (paid), so it's for after funding.
5. **No CI visibility from here.**
   - The workflows exist, and the browser suites now run in CI.
   - But nobody has confirmed a green GitHub run (the repo is private).
   - A broken CI would go unnoticed until the PR to `master`.

---

## 2. Git & deployment status

| Item | First audit | Now |
| --- | --- | --- |
| `dev` on GitHub | Never pushed; 66 commits only local | **Pushed**; `dev` = `origin/dev` @ `61969ae` |
| `dev` vs `master` | 66 ahead | **144 ahead** (`master..dev`) |
| `master` / production | `3c5d884`, Sep 22, database at 014 | Unchanged |
| Migrations waiting for production | 015 → 027 | **015 → 039** (25 files, listed in GO_LIVE_CHECKLIST §3) |
| Rehearsal | — | `e2e/golive-rehearsal.sh --old` passes: 189 columns, 102 constraints and **84 indexes** match the dev schema, old rows kept, old and new code both work, every down restores the live schema exactly |
| Workflows | `ci.yml`, `keepalive.yml`, only on `dev`, never run | `ci.yml` (lint, Vitest, i18n, build, header and bundle checks, backend tests, browser smoke/full), `keepalive.yml`, `cleanup.yml` (needs `CLEANUP_SECRET`). Run status not visible (private repo) |
| Env validation | None; port hardcoded | `config/env.js` refuses to start on a missing or malformed var; `PORT` comes from the environment |
| Frontend headers | None | CSP (`script-src 'self'` plus the inline-theme hash; `style-src`/`font-src 'self'`), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP; guarded by `check:headers` in CI |

**Env vars, by name.** The new ones since the first audit are all
optional and off until set:
- `BREVO_API_KEY`, `EMAIL_FROM`;
- `CLEANUP_SECRET`;
- `SENTRY_DSN`;
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`;
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`;
- `TRUST_PROXY`.

They're listed with their effects in GO_LIVE_CHECKLIST §2.

---

## 3. Feature verification

**Legend:**
- ✅ works;
- ⚠️ works but needs an owner key or step in production;
- ❌ broken;
- ⛔ missing.

**Evidence abbreviations:**
- `API:x` — `backend/tests/api/x.test.js`;
- `E2E:x` — `e2e/x.cjs`;
- `P` — today's probe.

### Changed since the first audit

| Feature | Then | Now | Evidence |
| --- | --- | --- | --- |
| Rate limiting behind the proxy | ❌ | ✅ | `trust proxy` (`30b1dba`); logged-in traffic is limited per user, anonymous per IP; API:rateLimit runs the real limiters (9 cases, incl. the data download) |
| Own posts on Home | ❌ | ✅ | `5e7edec`; E2E:day2-own-post 20/20 |
| Media deleted with its content | ❌ (never) | ✅ | `services/mediaCleanupService.js`: post, story, message, avatar, account and group/page removal; API:mediaCleanup 19, API:cloudinaryOrphans |
| Password reset / verification email | ⚠️ (SMTP blocked, tokens logged) | ⚠️ owner key | Brevo HTTP adapter (`53fa111`), never logs links in production (`756c953`), a clear "not available" message without a key; API:email 19, E2E:day5-email-off |
| Session control | ⛔ | ✅ | Sessions table, revoke one or all others, password change signs out other devices; API:sessions 21, E2E:day8-sessions, day8-sessions-list |
| Cleanup (stories, notifications, sessions, errors, previews) | ⛔ | ⚠️ owner secret | `services/cleanupService.js` + `cleanup.yml`; API:cleanup |
| Error monitoring | ⛔ | ✅ (+ optional Sentry) | `error_groups` + Admin → Errors; structured request log; API:errorLog, monitoring |
| Bot protection | ⛔ | ✅ (+ optional Turnstile) | form token, honeypot, login delay; E2E:day11-bots 44/44, day11-turnstile 31/31 |
| Reporting comments, messages, groups, pages | ⛔ | ✅ | API:reportTargets 13, reportGroupsPages 5; E2E:day12-report 37/37, day24-report-places 16/16 |
| Moderation: suspend, remove comments/messages, groups/pages | partial | ✅ | E2E:b12-admin, day12-review |
| Language saved to the account | ⛔ | ✅ | migration 033; API:language; E2E:day16-language |
| Link previews (SSRF-safe) | ⛔ | ✅ | `ssrfGuard.isPublicAddress`, pinned lookups, manual redirects; API:linkPreview; E2E:day19-links 16/16; P: 6/6 loopback tricks never reach a local listener |
| Share cards for crawlers | ⛔ | ✅ | posts, profiles and pages; private content gets a generic card; P: HTML in a post is escaped in the card; E2E:day19-share 20/20 |
| "Only me" audience | ⛔ | ✅ | migration 035; E2E:day20-only-me; P: hidden from search, profile, feed and share cards |
| Web push | ⛔ | ⚠️ owner keys | VAPID, endpoint allow-list, offline-only message pushes with no message text; API:push; E2E:day22-push |
| Message notification setting + mute a conversation | ⛔ | ✅ | migration 037; API:mute; E2E:day23-mute |
| Self-hosted fonts | ⚠️ Google Fonts | ✅ | @fontsource; CSP `font-src 'self'`; E2E:day19-share checks there's no Google request |
| Accessibility | not audited | ✅ | axe-core WCAG 2.1 A/AA on every route, light/dark, EN/MY/AR: 0 serious (E2E:day26-a11y 88 page checks); keyboard focus rings |
| Performance at scale | not measured | ✅ | E2E:day27-perf: about 1M seeded rows, 30 endpoints, no full scans and ≤ 20k rows read per request; migration 039 |
| Download your information | ⛔ | ✅ | `GET /profile/export`; API:dataExport 7; E2E:day28-export 12/12; P: no secrets or other people's emails |
| Privacy Policy matches the app | draft, out of date | ✅ (still marked draft for the owner's review) | rewritten from the code on Day 28, EN/MY/AR; E2E:c2-legal 11/11 |

### Unchanged and still working

- Signup and login, profile, posts, the feed and its pagination.
- Reactions, comments and replies, follows and private accounts.
- Search, notifications.
- DMs: real time, typing, presence, read receipts, edit/reply/photos,
  voice.
- Group chat, groups, pages, stories.
- Hashtags, mentions, bookmarks, block.
- PWA, theme.
- EN/MY/AR with RTL.

All of these are covered by the 38 browser suites and the backend tests
listed above, and all passed today.

### Placeholders still visible

- **Settings rows:** 9 are disabled "Coming soon" rows: Who can see my
  content, Followers & following, Content preferences, News feed
  settings, Story settings, Help & support, About, plus Reels/videos and
  Live streaming (paused features).
- **Elsewhere:** the Videos/Shorts tabs, the composer's Video/Live
  buttons and the Settings search button are disabled. All of these but
  the search are paused features.

---

## 4. Bugs

### First-audit bugs

| # | Was | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Critical: rate limits keyed on the proxy IP | ✅ Fixed (dev) / ❌ **still live** until GO LIVE | `30b1dba`, `9c78b40`, `c1f5faf`; API:rateLimit |
| 2 | Critical (process): `dev` only on disk | ✅ Fixed | `origin/dev` in sync |
| 3 | High: own posts missing from Home | ✅ Fixed | `5e7edec`; E2E:day2-own-post |
| 4 | High: email undeliverable, links in logs | ✅ Fixed in code; ⚠️ needs a Brevo key | `53fa111`, `756c953`, `ca60e8c` |
| 5 | High: media never deleted | ✅ Fixed | `10a7eca`, `a97d547`, `f765d31` |
| 6 | Medium: tokens can't be revoked | ✅ Fixed | `aac4976`, `368775f` |
| 7 | Medium: no env check, hardcoded port | ✅ Fixed | `5283798`; API:env 15 |
| 8 | Medium: tables grow forever | ✅ Built; ⚠️ needs `CLEANUP_SECRET` | `932ff0b` |
| 9 | Medium: only posts/users reportable | ✅ Fixed | `6518fd9`, `3254d7c` |
| 10 | Low: provider errors as raw 400 | ✅ Fixed (502, generic text) | `8ce90a7`; API:uploadErrors |
| 11 | Low: link-preview URL scheme | ✅ Fixed | `8ce90a7`, Day 19 `utils/links.js` |
| 12 | Low: no frontend security headers | ✅ Fixed | `9945631`; `check:headers` in CI |

### New findings

| # | Severity | Finding | Evidence | Suggested fix |
| --- | --- | --- | --- | --- |
| N1 | Medium | No route-level auth guard. 5 protected screens render their UI for logged-out visitors (Account Management, Sessions, Create Post, Saved, Create group); `/admin` makes 2 API calls that get 401 before it redirects. No data leaks (the API refuses), but it's a broken experience, and it's the same root as the Day 16 note about screens re-rendering on a forced logout | Today's browser probe: `/settings/account` → stays and shows the form; `/admin` → 2×401, then `/login` | A `RequireAuth` wrapper on every auth-only route in `App.jsx` that redirects to `/login` (keeping the target), plus a browser suite over all of them |
| N2 | Low | One full backend run on Day 28 had one failing test that passed in the next 3 runs; the name wasn't captured | WIP.md note | Run the suite several times in a loop; when it fails, fix the test's isolation |
| N3 | Low | Explore (posts and hashtags) aggregates the last 7 days on every request (~5.7k rows read at the perf seed). This grows with weekly volume | E2E:day27-perf row counts | Precompute trending into a table refreshed by the cleanup job when traffic grows (Phase 2) |
| N4 | Low | Dead code: `frontend/src/components/feed/PostContent.jsx` and the Vite template files `frontend/src/assets/{hero.png,react.svg,vite.svg}` (imported nowhere; the assets were already listed in the first audit) | grep | Delete them |
| N5 | Info | 117 `console.error`/`console.log` calls in the frontend (mostly in catch blocks next to a user-facing error message). The backend has 0 (a test forbids them) | grep | Optional: send unexpected ones to `/client-errors` |
| N6 | Info | The login token is still in localStorage, so a future XSS could read it. It's mitigated by the strict CSP (no inline or eval scripts) and React escaping; no XSS was found | `useAuth.js`; CSP in `vercel.json` | Longer term: an httpOnly cookie session (needs CSRF handling) |

---

## 5. Security, performance and code quality

**Security**

- ✅ **Route coverage:** a script read all 121 routes.
  - 80 need a login and 8 are admin-only (login + `requireAdmin`, which
    answers 404 to non-admins).
  - 19 are optional-auth reads that go through the visibility rules, and
    1 is secret-protected (`/internal/cleanup`, 404 without the secret).
  - 13 are intentionally public: signup, login, forgot/reset password,
    verify email, form token, config, push config, health, follow
    counts, and the 3 share cards.
- ✅ **Fresh probes (32/32):**
  - data export: needs a login, no other people's emails, no secrets;
  - only-me and followers-only posts stay hidden from search, profile,
    the feed, the detail page and share cards;
  - share cards escape HTML;
  - link preview refuses loopback, metadata, private and file URLs, and
    6 obfuscated loopback forms never reached a local listener;
  - push refuses non-allowlisted endpoints;
  - you can't revoke someone else's session, or mute, read or post into
    someone else's chat (REST and Socket.io);
  - a bad socket token is refused;
  - admin and internal endpoints answer 404 to others;
  - a 200 kB client-error report gets 413;
  - a banned user is refused (including the export);
  - private-account content and lists stay hidden;
  - helmet headers are set and `X-Powered-By` is absent.
- ✅ **Dependencies:** `npm audit --omit=dev`: 0 vulnerabilities in
  backend, frontend and e2e.
- ✅ **Unchanged:** parameterised SQL; uploads limited to an allowlist
  and 5 MB; hashed single-use tokens; no secrets in the repo; test-only
  origins (link stub, push stub, Turnstile URL) are honoured only
  outside production.
- ⚠️ **Still missing:**
  - 2FA (planned for Day 77);
  - content filtering (Day 49);
  - an admin audit log beyond report resolution fields (Day 63).

**Performance**

- ✅ **Database:**
  - 84 indexes, and the dev fixture now equals production plus 039.
  - The fixture used to miss every pre-015 index; the rehearsal now
    compares indexes.
  - The perf suite guards 30 endpoints at about 1M rows.
  - The inbox went from 3 s to 60 ms, and a popular hashtag page from
    15k rows read to about 30.
- ✅ **Images:** sized and lazy everywhere. Avatars are square crops at
  1x/2x/3x, and feed images have a 320–1440 px srcset.
- ✅ **Bundle:** the first download is 213.8 kB gzipped (budget 225 kB in
  CI). Screens, translations and the chat client load on demand.
- ⚠️ Explore aggregation (N3); the single instance (risk 4).

**Free-tier fit**

- **Render 512 MB:** one process; in-memory state is small.
- **Neon 0.5 GB:** bounded once the cleanup job runs (LATER #4).
- **Cloudinary:** files are now deleted with their content, and there's
  an orphan scan (`npm run cloudinary:orphans`).
- No paid service is required.

**Code quality**

- ✅ No TODO/FIXME/HACK markers; 0 `console.*` in the backend
  (structured logger).
- ✅ Most of the first audit's dead code is gone (9 components, the
  FeedActions context, App.css). `PostContent.jsx` and the 3 template
  assets are left (N4). `messages_dm_legacy` stays on purpose: it holds
  pre-003 DMs and is part of the data download.
- ✅ Consistent routes → controllers → services, with shared SQL
  fragments for visibility, reactions and media.

**Tests**

| Suite | Count | Result | In CI? |
| --- | --- | --- | --- |
| Backend API (Jest + Supertest, real PostgreSQL) | 52 files, 578 tests | 578/578 ✅ | Yes |
| Frontend unit (Vitest + RTL) | 11 files, 65 tests | 65/65 ✅ | Yes |
| Browser suites (headless Edge) | 38 suites, 659 checks | 659/659 ✅ | Yes: smoke on push, full on PRs to `master` |
| A3 visual matrix | 228 page checks × EN/MY/AR | 0 failures ✅ | In the full run |
| Perf suite | 30 endpoints at ~1M rows | 30/30 ✅ | In the full run |
| Go-live rehearsal | 015 → 039, up/down/up, old and new code | PASSED ✅ | Run by hand before each GO LIVE |
| `check:i18n`, `check:headers`, `check:bundle` | 884 keys × 3; CSP; 225 kB | ✅ | Yes |

**Remaining coverage gaps:**
- real email, Cloudinary, push and Turnstile (keys);
- load and concurrency beyond the perf seed;
- multiple instances;
- confirming the CI runs on GitHub.

---

## 6. Gap analysis vs. a full Facebook/Instagram-style app

### First audit's P0 and P1 — where they stand

| Item | Status |
| --- | --- |
| Push `dev`; fix the proxy rate limit; own posts; env check and PORT; media deletion | ✅ Done |
| Production email via HTTP API | ✅ Code done; ⚠️ owner key (LATER #3) |
| Deploy (migrations, merge) | ⚠️ **Owner** (GO_LIVE_CHECKLIST, rehearsed) |
| Session control; web push; error monitoring; bot protection; report everything; cleanup | ✅ Done (push, Sentry, Turnstile and cleanup wait for owner keys or secrets) |
| Link previews; share cards; data export; accessibility; frontend headers; browser suites in CI; self-hosted fonts | ✅ Done |
| 2FA + backup codes | ⛔ Planned Day 77 |
| Content filtering | ⛔ Planned Day 49 |
| Backups/staging (Neon branch, restore) | ⚠️ Owner; documented in the checklist |

### Still to build (owner-free, on the plan)

- **Messaging:** reactions, search, pinned messages (Days 31–32).
- **Profile and social:** profile upgrade (36), friend requests (37–38),
  better search (42), privacy controls for the disabled Settings rows
  (47), activity log (48).
- **Posts:** polls (44), drafts and scheduled posts (45), saved
  collections (46).
- **Community:** events (55–56).
- **Admin:** audit log (63).
- **Onboarding and states:** onboarding (78–79), empty and error states
  (80).
- **Not on a numbered Day yet:** the Settings rows Help & support and
  About.

### Paused

Short and long video, calls, random video chat, live streaming. These are
shown as disabled tabs and rows, as before.

---

## 7. Recommended order of work

1. **Day 30 (owner-free part):**
   - fix N1 (a route guard plus a suite over every protected route);
   - fix N4 (dead code);
   - chase N2 (loop the backend suite to catch the flaky test);
   - then rerun the full verification.
2. **Owner, whenever possible** (each step is in LATER.md):
   - GO LIVE (#2), which also closes the still-live rate-limit bug;
   - confirm CI on GitHub (#1);
   - Brevo key (#3), cleanup secret (#4), VAPID keys (#7). The Privacy
     Policy's retention promise depends on #4;
   - optional: Turnstile (#6), Sentry (#5);
   - before the public launch: a legal review of `/terms` and `/privacy`,
     and native-speaker reviews of Myanmar and Arabic.
3. **Phase 2 (Days 31+) as planned**, starting with the messaging
   upgrade. Fold N3 (precomputed trending) into Day 40–41 Explore.
4. **After funding:** Redis for sockets and rate limits (multiple
   instances), and an httpOnly-cookie session (N6).
