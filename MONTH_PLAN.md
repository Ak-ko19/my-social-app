# MONTH_PLAN.md — Long-term autonomous plan (continuous work, no end date)

Source of truth for priorities: AUDIT_REPORT.md (commit b582d92).
The owner does NOT write code. Claude Code works alone and continuously, Day after Day, until the owner presses Esc. "Day" means a unit of work, not a calendar day.

## Work rhythm — one step at a time, slowly and correctly
A "step" = one checkbox task. Never work on two steps at once. Correctness matters more than speed.

For EVERY step, follow this cycle:
1. PLAN — Read all related code first. Write in WIP.md: current Day, current step, and a short plan (data model, API, UI, edge cases, security, tests).
2. BUILD — Implement carefully in small pieces. Run the related tests after each piece. If unsure about anything, read more code before writing.
3. VERIFY — When the step looks finished, check it thoroughly:
   - run the FULL backend test suite plus the browser suites related to this step — all must pass (the FULL browser suite, `e2e/run-all.sh`, runs once at the end of each Day, before the Day's Progress Log entry);
   - try the feature yourself in the running app: main flow, failure cases, edge cases;
   - check light/dark theme, mobile width, and EN/AR + RTL;
   - re-read your whole diff as a strict reviewer against the Quality bar.
4. FIX — Fix everything the verification found, then VERIFY again. Repeat until clean.
5. SAVE — Commit with a clear message, push to dev, tick the checkbox, update WIP.md ("step done").
6. PAUSE — Take stock before moving on: print a short step report (what was built, what was verified, any concerns), re-read MONTH_PLAN.md and the next step, then start the next step's PLAN right away, in the same turn. PAUSE does NOT mean ending the turn: keep going step after step until the owner presses Esc.

Commit and push ONLY at step 5 (once per finished step). Do not commit half-finished work.

Never end the turn while waiting for tests: run them in the foreground and wait for the result (long runs: use a wait loop in the same turn), then continue.

Save memory (owner rule, 2026-10-13 — this machine has run out of memory during browser runs):
- Run browser suites in small batches (`E2E_ONLY="a b c" bash run-all.sh`, at most five suites; heavy ones such as a3-visual, day26-a11y and day27-perf alone).
- Shut down the test stack between batches (`cd e2e && bash e2e-down.sh`).
- Never run two heavy jobs at the same time: one browser batch, or one backend Jest run, or one build — never two at once.

## When the owner presses Esc
The owner may press Esc for an emergency, when the usage limit is near, or to end the day's work. So:
- WIP.md must always show the current Day, step, plan, and which parts are done (update it as you go — it is a file, not a commit).
- When resuming: read WIP.md, run `git status` and `git log -5`. Uncommitted changes = an unfinished step. Review them carefully: if they are good, continue that step from where it stopped; if broken or unclear, revert them and restart that step from PLAN. Never commit leftover work without running the full VERIFY.
- When a whole Day is done: add the Progress Log entry, clear WIP.md, commit, push.

## Quality bar (every task, no exceptions)
Build every feature the way a senior engineer at a top social media company would ship it to millions of users.
1. Think first: before coding, read the related code, check how Facebook/Instagram/X handle the same feature, and write a short plan in WIP.md covering data model, API, UI, edge cases, and security.
2. Complete, not minimal: backend + database migration + API validation + frontend UI + real-time updates where it makes sense + notifications where it makes sense + translations (EN/AR, RTL correct in Arabic) + light and dark theme.
3. Edge cases: empty states, loading states (skeletons), errors, offline, very long text, Arabic (RTL) text and text in other scripts (people may write in any language), blocked users, private accounts, deleted content, duplicate clicks, slow network.
4. Security: auth and ownership checks on every route and socket event, input validation, rate limits, no data leaks to blocked/private users.
5. Performance: indexes for new queries, pagination for every list, no N+1 queries, optimized images, optimistic UI.
6. UI/UX: follows the existing design tokens, smooth animations, mobile-first and responsive, accessible (keyboard, labels, contrast, alt text).
7. Tests: backend tests for success AND failure cases, browser checks for the main flow. All existing tests must still pass.
8. Self-review before commit (VERIFY stage): re-read your own diff as a strict reviewer, fix anything weak, remove debug code, keep code clean and consistent.
9. If a better approach exists than what this plan says, use the better approach and explain why in the Progress Log.
10. Never fake it: no placeholders, no TODO stubs, no mock data in production code. If something cannot be done fully, say so in the Progress Log.

## Standing rules (apply every day)
1. Work on the `dev` branch. Never commit directly to `main` except on "GO LIVE" days.
2. Before starting a Day: `git pull`, read this file, AUDIT_REPORT.md, CLAUDE.md, and the Progress Log below.
3. If AUDIT_REPORT.md shows a task is already done, verify it quickly, tick it, and move on.
4. Every change needs tests (backend tests and/or browser checks). All tests must pass before commit.
5. Never touch the production database except on GO LIVE days, and only after you have taken your own pg_dump backup.
6. Never put secrets in code or commits. List required env var NAMES only.
7. Commit + push after every finished step (Work rhythm stage 5). At the end of every Day also add a Progress Log entry.
8. The owner is NOT available. Never wait for them and never ask them anything. If a task truly needs something only a human can do (new account signup, new API key, dashboard click), skip that part, note it in LATER.md, and build everything else so it works without it.
9. Never stop on your own after finishing a Day. Immediately start the next Day and keep going until the owner interrupts you.
10. Paused (do not build): short video, long video, voice/video call, random video chat.
11. The owner is a student with exams and will only paste the daily prompt. Choose only work you can finish alone, that runs on free tiers (Render 512MB, Neon 0.5GB, Cloudinary free), and needs no new outside account or API key.
12. NEVER-ENDING RULE: when every Day in this file is ticked, do NOT stop. Run a full read-only audit, write AUDIT_REPORT_<next number>.md, then append the next 30 Days to this file (same format, same rules, owner-free only), and start the first new Day in the same session.
13. Keep the live site safe: after any GO LIVE, smoke test it; if anything breaks, roll back first and fix later on dev.
14. UI languages are English and Arabic only. Every new feature must ship fully translated in both, with correct RTL in Arabic. *(Owner decision 2026-10-07: Myanmar was removed as a UI language. User content — posts, comments, messages, search — stays open to any language. `npm run check:i18n` enforces EN/AR only, every Arabic string, and an Arabic version of every user-facing server message.)*

---

## WEEK 1 — Back up, fix critical bugs, go live

### Day 1 — Back up everything
- [x] Push `dev` to GitHub (all 66+ commits). Confirm the remote has them.
- [ ] Confirm CI runs on GitHub Actions; fix any CI failures. *(Both CI jobs pass locally — 233/233 API tests, lint, i18n, build. The remote run can't be seen from this machine; owner check in LATER.md #1.)*
- [x] Confirm the Render keep-alive workflow is present (it will run once on main).

### Day 2 — Rate limiter + own posts
- [x] Set `trust proxy` correctly for Render so each client IP is seen.
- [x] Rate-limit authenticated routes per user ID, anonymous routes per IP.
- [x] Enable rate limiting in a dedicated test so this bug cannot return (7 users must not block each other).
- [x] GET /feed includes the viewer's own posts; a new post appears at the top immediately.

### Day 3 — Startup safety + small bugs
- [x] Validate all required env vars at startup with a clear error message; read PORT from env.
- [x] Add security headers on the frontend (Vercel config).
- [x] Fix the remaining Low bugs from the audit.

### Day 4 — Cloudinary cleanup
- [x] Deleting a post, story, message, or account deletes its images/voice notes from Cloudinary.
- [x] Store Cloudinary public_id wherever it is missing (migration if needed). *(Not needed: every stored URL is Cloudinary's secure_url, which contains the public_id and resource type; derived by one parser that round-trips the real SDK's URLs. See Progress Log.)*
- [x] Script to find and delete orphaned Cloudinary files (dry-run mode first).

### Day 5 — Working email in production
- [x] Add an HTTP email adapter (Brevo API) that turns on automatically only when its env var exists. Keep Nodemailer for local dev.
- [x] In production, NEVER write reset/verification links to logs.
- [x] Graceful fallback when no email provider is configured: the app must not break or lock users out (e.g. skip the verification requirement and show a friendly message on forgot-password).
- [x] Note in LATER.md: "Add Brevo API key to turn on real emails."

### Day 6 — Go-live preparation
- [x] Write GO_LIVE_CHECKLIST.md: backup, migrations 015–027, env vars, deploy order, rollback steps.
- [x] Test migrations 015–027 on a fresh local DB copied from the production schema. *(Rebuilt from the repo, since production can't be touched: `e2e/golive-rehearsal.sh`.)*
- [x] Check what access exists: production DATABASE_URL, whether pushing to main auto-deploys on Render/Vercel. *(None for Claude Code: CLAUDE.md forbids the production DB; no Render/Vercel access. Details in LATER.md #2.)*

### Day 7 — GO LIVE #1 (only if you have the access)
*Skipped 2026-09-29: no production access (CLAUDE.md hard limits). The owner runs GO_LIVE_CHECKLIST.md (LATER.md #2); the boxes below stay open for that.*
- [ ] If you have production DB access: take your own backup with pg_dump to a local file first. If no access, skip GO LIVE, note it in LATER.md, and continue with Day 8.
- [ ] Follow GO_LIVE_CHECKLIST.md: run migrations, deploy backend and frontend, merge dev → main.
- [ ] If anything fails on live: roll back immediately (revert main, restore backup) and note it in LATER.md.
- [ ] Smoke test the live site: signup, login, post, image, like, comment, DM, voice message, notifications, password reset.
- [ ] Confirm CI and keep-alive now run on main.

---

## WEEK 2 — Security and reliability

### Day 8 — Session revocation
- [x] Changing the password signs out other devices (token version or refresh-token table).
- [x] "Log out of all devices" in Settings; active sessions list.

### Day 9 — Cleanup jobs
- [x] Scheduled job (GitHub Actions cron calling a protected endpoint) to delete expired stories and old notifications, including their Cloudinary media.

### Day 10 — Monitoring
- [x] Built-in error logging (errors saved to a DB table + admin view). Add a Sentry hook that turns on only if its env var exists.
- [x] /health endpoint checks DB connectivity; structured logging; remove stray console.logs.

### Day 11 — Bot protection
- [x] Bot protection that needs no outside account: honeypot fields, minimum form-fill time, progressive delays after failed logins, stricter limits on signup/forgot password.
- [x] Add a Turnstile hook that turns on only if its env var exists.

### Day 12 — Moderation
- [x] Report comments and messages.
- [x] Admin report-review page (admin role, list, resolve, remove content, suspend user).

### Day 13 — Test coverage
- [x] Add browser suites to CI.
- [x] Set up Vitest + React Testing Library with tests for the main components.

### Day 14 — GO LIVE #2 (only if you have the access) + buffer
*GO LIVE skipped 2026-10-01: no production access (CLAUDE.md hard limits) — owner action, LATER.md #2. Buffer done: nothing left from Week 2 except the owner's GO LIVE steps; rehearsal re-run on current dev (015 → 032) PASSED.*
- [ ] Finish anything left from Week 2, deploy, smoke test, merge to main.

---

## WEEK 3 — Languages and core social features

### Day 15 — i18n framework
- [x] Add react-i18next; move all UI text into English translation files. *(Already built in B15; verified 2026-10-01 — see Progress Log.)*

### Day 16 — Language per user
- [x] Language switcher in Settings; save choice per user. *(Built Day 16. Its Myanmar translations and Myanmar web font were removed on 2026-10-07 — the UI is EN/AR only, standing rule 14.)*

### Day 17 — Arabic + RTL
- [x] Arabic translations; full right-to-left layout (dir="rtl", logical CSS properties); check every screen. *(Built in B16; verified Day 17 — see Progress Log.)*

### Day 18 — Comment replies + reactions
- [x] Threaded replies to comments (if AUDIT_REPORT.md marks missing). *(Exists — B4/B1; verified Day 18.)*
- [x] Reactions beyond like (if missing). *(Exists — B4/B1; verified Day 18.)*

### Day 19 — Link previews + share cards
- [x] Link previews in posts and messages (server-side fetch with timeout and size limit).
- [x] Open Graph share cards for public post URLs.

### Day 20 — Posts upgrade
- [x] Multiple images per post (if missing). *(Exists since B2; verified Day 20.)*
- [x] Per-post privacy: public / followers / only me (if missing). *(public/followers since B5; "only me" added Day 20.)*

### Day 21 — GO LIVE #3 (only if you have the access) + buffer
*GO LIVE skipped 2026-10-03: no production access (CLAUDE.md hard limits) — owner action, LATER.md #2. Buffer: nothing left from Week 3; rehearsal 015 → 035 PASSED on current dev.*

---

## WEEK 4 — Engagement and polish

### Day 22 — Push notifications
- [x] Web push (VAPID, via the existing PWA service worker).

### Day 23 — Notification settings
- [x] Per-type on/off (likes, comments, follows, messages), mute a conversation.

### Day 24–25 — Next P1 features from the gap list
- [x] Take the highest-priority free-tier-compatible P1 items from AUDIT_REPORT.md (e.g. friend requests or basic groups) and build them. *(Report groups/pages, share cards for profiles/pages, self-hosted fonts — see Progress Log.)*

### Day 26 — Accessibility
- [x] Keyboard navigation, focus states, alt text on images, labels, colour contrast in both themes. *(axe-core suite day26-a11y + contrast token fixes — see Progress Log.)*

### Day 27 — Performance
- [x] DB indexes for slow queries, responsive Cloudinary image sizes, lazy loading, bundle check. *(day27-perf suite, migration 039, query shapes, image srcsets, bundle budget — see Progress Log.)*

### Day 28 — Privacy
- [x] "Download my data" export; make the Privacy Policy match what the app really does. *(GET /profile/export + Settings section; policy rewritten from the code — see Progress Log.)*

### Day 29 — Re-audit
- [x] Repeat the full read-only audit; write AUDIT_REPORT_2.md comparing with the first audit. *(AUDIT_REPORT_2.md — see Progress Log.)*

### Day 30 — GO LIVE #4 (only if you have the access)
*GO LIVE skipped 2026-10-06: no production access (CLAUDE.md hard limits) — owner action, LATER.md #2. The owner-free part is done: AUDIT_REPORT_2 N1 (route guard), N2 (flaky test) and N4 (dead code) fixed — see Progress Log.*
- [ ] Deploy and smoke test. Fix any top items from AUDIT_REPORT_2.md first.


---

## PHASE 2 — Days 31–60: Richer social features

### Day 31–32 — Messaging upgrade
- [x] Reply to a message, react to a message, edit/unsend, forward. *(Reply, edit, unsend existed (B9); reactions and forward built — see Progress Log.)*
### Day 33–35 — Group chats
- [x] Create group, add/remove members, admins, group name/photo, real-time via Socket.io. *(Create/add/remove/rename/live existed (B10); admin management and group photo built — see Progress Log.)*
### Day 36 — Profile upgrade
- [x] Cover photo, links, joined date, pinned post. *(All four built — see Progress Log.)*
### Day 37–38 — Friend requests (if missing)
- [x] Send/accept/decline/cancel, friends list, mutual friends. *(Requests existed; friends = mutual follows, lists and mutual friends built — see Progress Log.)*
### Day 39 — People you may know
- [x] Suggestions from mutual follows/friends; no external services. *(Built in B8 and verified; hiding a suggestion added — see Progress Log.)*
### Day 40–41 — Explore page
- [x] Trending hashtags, popular posts (last 7 days), explore by hashtag. *(Built in B7 and verified; Top/Recent tabs and a trending cache added — see Progress Log.)*
### Day 42 — Better search
- [x] PostgreSQL full-text search with ranking; search history; filters (people/posts/hashtags). *(Ranked search, hashtag search with tabs, recent searches — see Progress Log.)*
### Day 43 — (removed from the plan, owner decision 2026-10-07)
*Myanmar is no longer a UI language, so this Myanmar-specific step is out of the plan. What it already shipped for user content stays, because people may still write in any language (standing rule 14): any-script hashtags and @mentions, and the server turning old-style Zawgyi Burmese into Unicode. See the 2026-10-07 Progress Log entry.*
### Day 44 — Polls
- [x] Poll posts with options, vote once, results bar. *(See Progress Log; the "poll ended" notification was added on Day 45.)*
### Day 45 — Drafts + scheduled posts
- [x] Save drafts; schedule a post. *(A 30 s server ticker instead of the daily cron, which couldn't hit a set time; plus the "poll ended" notification Day 44 left out — see Progress Log.)*
### Day 46 — Saved collections
- [x] Organize bookmarks into named collections. *(Instagram-style: "Save to collection" from any post, collections on Saved — see Progress Log.)*
### Day 47 — Privacy controls
- [x] Mute user, restrict user, close friends list, who can message/comment on me. *(Four steps, Instagram-style — see Progress Log.)*
### Day 48 — Activity log
- [x] Your likes, comments, searches; delete items. *(Settings > Your activity, Facebook-style — see Progress Log.)*
### Day 49 — Content filtering
- [x] Local bad-word list (EN/AR) with hide-or-warn option; spam detection (repeated links, flood posting). *(Instagram-style Hidden words + server spam checks — see Progress Log.)*
### Day 50–52 — Groups (basic)
- [x] Create group, public/private, join/leave/request, group posts, group admins, group moderation. *(Most built in B13; added ban, delete, paging and group notifications — see Progress Log.)*
### Day 53–54 — Pages (basic)
- [x] Create page, follow page, post as page, page admins. *(Create/follow/post as page from B14; page admins, the pages list and the admin notification added — see Progress Log.)*
### Day 55–56 — Events (basic)
- [x] Create event, going/interested, event page, reminders via notifications. *(Built new, Facebook-style — see Progress Log.)*
### Day 57 — Storage safety
- [x] Check Neon and Cloudinary usage; client-side image compression before upload; limits per user; warn in admin panel near limits. *(See Progress Log.)*
### Day 58 — Accessibility + translations check
- [x] All new screens translated (EN/AR) and RTL-correct.
### Day 59 — Re-audit (AUDIT_REPORT_3.md)
- [x] Repeat the full read-only audit; write AUDIT_REPORT_3.md comparing with the second audit. *(AUDIT_REPORT_3.md — see Progress Log.)*
### Day 60 — GO LIVE (only if you have the access)
*GO LIVE skipped 2026-10-13: no production access (CLAUDE.md hard limits) — owner action, LATER.md #2. The owner-free part is done: AUDIT_REPORT_3 A1 (dependency advisories, now audited in CI) and A2 (no dead Settings rows; Help and About pages) fixed — see Progress Log.*

---

## PHASE 3 — Days 61–90: Quality, admin, and long-term health

### Day 61–62 — Admin dashboard
- [x] Users, posts, reports, signups per day, storage usage, error log — charts built locally, no outside analytics. *(Admin > Overview — see Progress Log.)*
### Day 63 — Audit log
- [x] Record admin actions (who removed what, when). *(Admin > Log — see Progress Log.)*
### Day 64–66 — End-to-end tests
- [x] Playwright tests for the 15 most important user journeys; run in CI. *(journeys-core / -social / -safety, e2e/JOURNEYS.md; AUDIT_REPORT_3 A3 done too — see Progress Log.)*
### Day 67–68 — API documentation
- [x] OpenAPI spec for every endpoint; docs page for developers. *(backend/docs/openapi, GET /docs, docs/REALTIME.md; every API test's responses checked against it — see Progress Log.)*
### Day 69–71 — Code health
- [x] Remove duplicated logic, split large files, consistent error handling, update README and CLAUDE.md. *(One error type, one block-check helper, bounded lists, a message-paging bug fixed, the chat hook split, README — see Progress Log.)*
### Day 72–73 — Offline + PWA polish
- [x] Offline feed cache, offline message queue, install prompt, app icons. *(Offline banner + saved Home, a message queue, "Install the app", an opaque maskable icon, a tidy service worker — see Progress Log.)*
### Day 74 — Performance round 2
- [x] Slow-query review, caching headers, image sizes, bundle splitting. *(Motion after first paint, Home by cursor, no-store API, 2048 px stored photos, a 1-minute perf suite — see Progress Log.)*
### Day 75–76 — Security round 2
- [x] Re-check every route, file upload, socket event; dependency updates; CSP headers. *(Advisories patched, messages kept as typed, sweeps over every route, uploads checked by their bytes, socket limits, CSP reports — see Progress Log.)*
### Day 77 — Account safety
- [x] Login alerts in notifications (new device), suspicious login slowdown, 2FA with authenticator app (TOTP — no outside account needed). *(New-device alerts, the Day 11 slowdown verified, 2FA with QR setup, recovery codes and a login code step — see Progress Log.)*
### Day 78–79 — Onboarding
- [x] First-run steps: profile photo, follow suggestions, language choice, tour. *("Get started" after a new account's first login: language, photo, people to follow, a tour; skippable, shown once — see Progress Log.)*
### Day 80 — Empty/error states
- [x] Friendly screens for every empty list, error, and offline case, in 3 languages. *(EN/AR since 2026-10-07. A bilingual audit of 35 screens found and fixed an offline crash and five dishonest or dead-end error states — see Progress Log.)*
### Day 81–82 — Notifications center upgrade
- [ ] Group similar notifications ("5 people liked your post"), mark all read, filters.
### Day 83–84 — Memories / "On this day"
- [ ] Show your posts from past years on the same date.
### Day 85–87 — Buffer: fix everything left in AUDIT_REPORT_3.md
### Day 88 — Documentation for the owner
- [ ] OWNER_GUIDE.md in simple English: what the app has, how to run it, what LATER.md items unlock.
### Day 89 — Re-audit (AUDIT_REPORT_4.md)
### Day 90 — GO LIVE (only if you have the access), then apply rule 12 and continue.

---

## Progress Log
(Claude Code adds one entry per Day: date, Day number, what was done, commits, tests passing, anything added to LATER.md.)

*Note: entries before 2026-10-07 say "EN/MY/AR" — that is what was built and tested at the time. Since the owner decision of 2026-10-07 the UI languages are English and Arabic only (standing rule 14).*

### 2026-09-28 — Day 1: Back up everything
- **Done:**
  - Pushed `dev` to GitHub with upstream: `origin/dev` == local, 68 commits
    ahead of `origin/master`. A secret scan before the push was clean.
  - Keep-alive workflow is present and valid. Its target returned 200
    after a 22.1 s cold start.
- **CI:** both jobs reproduced locally and green: 233/233 API tests (26
  suites), eslint, `check:i18n` (763 keys × 3), production build. The
  remote run couldn't be observed (private repo, no `gh`, browser extension
  offline), so step 2 stays unticked until the owner confirms it.
- **Rule conflict:** CLAUDE.md's hard limits (no merge to master, no
  production DB) override MONTH_PLAN's GO LIVE steps. Those steps are now
  owner items.
- **Commits:** `45aa29c`, `40fdd95`, BOM fix, and this entry.
- **LATER.md:** #1 check the first CI run; #2 merge to master / GO LIVE
  days are owner actions.

### 2026-09-28 — Day 2: Rate limiter + own posts
- **Step 1 (`30b1dba`):** `trust proxy` set from `config/trustProxy.js`.
  - 1 hop on Render (`RENDER=true`) or in production, off in local dev,
    overridable with `TRUST_PROXY`. Never `true`, which would let clients
    spoof their IP.
  - A real-server probe proved the fix: 7 clients no longer share one
    bucket, and spoofed X-Forwarded-For prefixes are ignored.
  - Audit bug #1 (Critical) is fixed on `dev`. It goes live with the next
    deploy.
- **Step 2 (`9c78b40`):** every limiter declares its key.
  - Anonymous surfaces are keyed per IP, even when a token is sent.
  - Logged-in limiters are keyed per user.
  - The global limiter keys per user when the JWT verifies, else per IP.
    It verifies the token and never just decodes it.
  - Also fixed a pre-existing flaky failure in e2e b12 (a Socket.io poll
    400 after a ban).
- **Step 3 (`c1f5faf`):** `RATE_LIMIT_IN_TESTS=1` runs the real limiters
  in `tests/api/rateLimit.test.js`.
  - Covers the audit's 7-user scenario plus each keying rule.
  - Mutation-checked: putting either bug back fails the tests.
- **Step 4 (`5e7edec`):** GET /feed now includes your own posts, with an
  id tie-breaker for stable paging. Audit bug #3 (High) is fixed.
  - New browser suite `day2-own-post`: a new post is the first card on
    Home in about 0.4 s, in EN/MY/AR, light/dark, 375–1280 px.
- **Better approach than the plan:** none needed. Also changed the Work
  rhythm on the owner's instruction: VERIFY runs related browser suites,
  and the full run happens once a Day.
- **Tests at close:**
  - backend 263/263 (29 suites);
  - full browser run ALL PASSED: 20 suites, 321 checks, plus A3 visual
    222/222 in each of EN, MY and AR.
- **LATER.md:** nothing new. Day 6's GO LIVE checklist must include a
  post-deploy rate-limit check from two networks, which is the only way
  to confirm Render's hop count.

### 2026-09-28 — Day 3: Startup safety + small bugs
- **Step 1 (`5283798`):** `config/env.js` checks the environment at
  startup and exits listing every problem. Audit bug #7 is fixed.
  - Always required: `DATABASE_URL`, `JWT_SECRET`.
  - Required in production: `ALLOWED_ORIGINS`, `FRONTEND_URL`.
  - Also checked: origin format, `PORT`, `TRUST_PROXY`.
  - Warnings only for a short secret or partial Cloudinary/email setup.
  - Secrets are never printed.
  - `PORT` comes from env. I fixed my own `PORT=0` bug in review.
- **Step 2 (`9945631`):** security headers for Vercel. Audit bug #12 is
  fixed.
  - Strict CSP (no unsafe-inline/eval, theme script allowed by hash),
    X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP.
  - **Better approach than the plan:**
    - `check:headers` in CI keeps the CSP in sync with the build.
    - `.gitattributes` pins `index.html` to LF. A CRLF checkout would have
      given a hash that is wrong on Vercel.
    - New `E2E_FRONTEND=dist` mode runs the browser suites on the
      production bundle with the real headers. The full run there passed
      with 0 CSP violations.
- **Step 3 (`8ce90a7`):** audit Low bugs #10 and #11.
  - New error handler:
    - 400 for bad uploads;
    - 502 with generic text when Cloudinary fails (provider text logged
      only);
    - 403 for CORS;
    - 500 for anything unexpected.
  - Upload messages translated into MY and AR.
  - Link previews render only for http(s) URLs.
- **Tests at close:**
  - backend 289/289 (31 suites);
  - full browser run ALL PASSED: 20 suites, 321 checks, plus A3 visual
    222/222 × EN/MY/AR (also passed in dist mode during step 2).
- **LATER.md:** nothing new.
- **Deferred to Day 13 (Vitest):** a unit test for `utils/safeUrl.js`
  (a node check covers it for now).

### 2026-09-28 — Day 4: Cloudinary cleanup
- **Step 1 (`10a7eca`):** media is deleted from Cloudinary with its
  content. Audit bug #5 (High) is fixed.
  - `mediaCleanupService` covers 9 delete paths: post, admin
    remove-post, story, message (REST and socket), account (avatar,
    posts, stories, sent media), replaced avatar, page, group, group
    chat.
  - Runs after the delete, not awaited, and never fails the user's
    action. `invalidate` also stops CDN copies.
  - **Better than the plan:** the upload middleware also deletes
    just-uploaded files when the request is refused (4xx), and a partly
    failed multi-image upload deletes the images that did upload.
- **Step 2 (`a97d547`):** public_id storage is not needed, so there is no
  migration.
  - **Better approach:** the ID and resource type are derived from the
    stored `secure_url`, which saves a backfill on a production DB already
    13 migrations behind and can't drift.
  - Verified by round-tripping URLs built by the real SDK. That found and
    fixed an issue: the parser now ignores a query string.
- **Step 3 (`f765d31`):** `npm run cloudinary:orphans` is a dry run by
  default.
  - It only touches the app's own folders and skips files under 24 h old.
  - `--delete` refuses, unless `--force` is given, on an empty DB or when
    more than 50% of files would go.
- **Tests at close:**
  - backend 317/317 (33 suites);
  - full browser run ALL PASSED: 20 suites, 321 checks, plus A3
    222/222 × EN/MY/AR.
- **Not verifiable here:** real Cloudinary deletes, since local dev has
  no credentials; the tests use the SDK's shapes and a mock API. Day 6's
  checklist gets a live check: delete a test post, then confirm its image
  URL stops loading and run the orphan scan.
- **LATER.md:** nothing new. Running the orphan scan against production
  is an owner step on the GO LIVE checklist.

### 2026-09-28/29 — Day 5: Working email in production
- **Step 1 (`53fa111`):** Brevo HTTPS email adapter. It switches on when
  `BREVO_API_KEY` is set; SMTP is kept for local dev.
  - The contract was checked against Brevo's API reference.
  - Sender comes from `EMAIL_FROM`, with a startup warning if it's
    missing.
  - Logs never contain the key or the body.
  - **Safety:** `BREVO_API_KEY` is pinned blank in the test setup, the
    e2e stack and `env.test.js`, so a real key in `.env` can never make
    the test suites send real emails.
- **Step 2 (`756c953`):** reset and verification links are never logged
  in production. Only "not sent", the subject and a masked recipient are.
  - Local dev still prints the email.
  - `config/runtime.js` `isProduction()` is now the single definition.
  - The real reset and signup flows were tested in production mode, and
    the test is mutation-checked.
- **Step 3 (`ca60e8c`):** graceful no-email fallback.
  - `GET /config {emailEnabled}`.
  - Forgot-password and resend-verification return an honest 503,
    checked before the address lookup so it doesn't reveal which emails
    have accounts.
  - The verify banner hides and forgot-password shows a translated
    notice (EN/MY/AR).
  - Nobody is locked out: verification is never required.
  - New browser suite `day5-email-off`.
- **Step 4 (`49c44c7`):** LATER.md #3 has step-by-step owner
  instructions for turning on Brevo, plus how to check it worked.
- **Flaky test fixed (`1eef2f5`):** b14 "unfollow from the page" failed
  once in the close-out run. `getByRole` name matching is a substring
  match, so "Follow" also matched "Following". It now uses
  `exact: true` and passed 5/5.
- **Tests at close:**
  - backend 336/336 (34 suites);
  - full browser run ALL PASSED: 21 suites, 340 checks, plus A3
    222/222 × EN/MY/AR.
- **Not verifiable here:** a real Brevo send (it needs the owner's
  account and key; see LATER.md #3).
- **LATER.md:** #3 added (Brevo key).

### 2026-09-29 — Day 6: Go-live preparation
- **Step 1 (`490a936`):** `GO_LIVE_CHECKLIST.md` for the owner.
  - Covers: backup (a pg_dump file plus a Neon branch), the env var
    table, migrations 015→027 with pre- and post-checks, deploy order,
    make-admin, and smoke tests (incl. live checks for the Day 2/3/4
    work).
  - Rollback plans A/B/C.
  - **Found:** `master`'s code ignores post audience, group privacy and
    bans. A code-only rollback after people use those features would
    leak private posts, so B is time-boxed with a warning and C says fix
    forward or restore the backup.
  - `*.dump` files are gitignored.
  - The backup, check and restore commands were verified on a local
    throwaway DB.
- **Step 2 (`dee6b63`):** **Better than the plan:** a reusable
  `e2e/golive-rehearsal.sh`, since production can't be copied.
  - It rebuilds the live schema from the repo (the fixture at 014 plus
    001/002) with realistic data.
  - It runs every migration from 015 exactly as the checklist does.
  - **Result:** REHEARSAL PASSED (37 checks).
    - The result matches the dev schema (149 columns, 91 constraints).
    - Data is kept and the backfills are correct.
    - The new AND old backends both work on the migrated DB.
    - The downs restore 014 exactly.
    - Positive control: a broken migration fails the rehearsal.
  - The checklist now requires the rehearsal to pass.
- **Step 3 (`c186f0c`):** access check without opening any secret.
  - Claude Code has no production DB access (CLAUDE.md) and no
    Render/Vercel access; auto-deploy can't be confirmed here.
  - **Day 7 (GO LIVE #1) was skipped**, noted in LATER.md #2, and work
    continues with Day 8.
- **Tests at close:**
  - backend 336/336 (no app code changed today);
  - full browser run ALL PASSED: 21 suites, 340 checks, plus A3
    222/222 × EN/MY/AR.
- **LATER.md:** #2 extended with the access findings and the Day 7 skip.

### 2026-09-29 — Day 7: GO LIVE #1 — skipped
- No production access (CLAUDE.md hard limits). Everything needed is in
  `GO_LIVE_CHECKLIST.md` for the owner (LATER.md #2).

### 2026-09-29 — Day 8: Session revocation
- **Step 1 (`aac4976`):** changing the password signs out your other
  devices. Audit bug #6 is fixed.
  - Migration 028 adds a `sessions` table and `users.tokens_valid_after`.
    It was rehearsed: schema = fixture, down restores, old code works.
  - The JWT carries a session id. `authorize()` checks the ban AND the
    session in one query (the same cost as the old ban check), for REST,
    optional auth and sockets.
  - Tokens from before sessions keep working, so the deploy logs nobody
    out, until revoked.
  - Password change: other sessions are revoked, pre-sessions tokens cut
    off, other devices' sockets kicked, and this device keeps (or gets) a
    valid token.
  - Password reset signs out every device.
  - **Found:** a mistyped confirmation password answered 401, which the
    frontend treats as logout. Change password, deactivate and delete now
    answer 403.
  - **Better than the plan:** a sessions table rather than a token
    counter, because step 2 needs a list.
- **Step 2 (`368775f`):** Settings → "Where You're Logged In".
  - Covers: the device list (browser and OS from the user agent), log out
    one, log out all others, and last-active times throttled to 5 min.
  - Settings → Log Out now ends the session on the server too; before,
    it only cleared the browser.
  - EN/MY/AR.
  - **Found:** the Arabic label read "Windows on Edge". Fixed with
    per-name bidi isolation, and the browser suite measures word order.
  - New route added to the A3 matrix.
- **Tests at close:**
  - backend 357/357 (35 suites);
  - full browser run ALL PASSED: 23 suites, 375 checks, plus A3
    228/228 × EN/MY/AR;
  - golive-rehearsal --old PASSED (015→028).
- **Carry-over:** Day 9's cleanup job must also delete expired or
  revoked sessions (one row per login).
- **LATER.md:** nothing new. GO_LIVE_CHECKLIST now lists migration 028
  and a live Day 8 check.

### 2026-09-29 — Day 9: Cleanup jobs
- **Step 1 (`932ff0b`):** daily cleanup. Audit bug #8 is fixed.
  - Deletes stories expired over 1 h ago (their views cascade, their
    photos are deleted from Cloudinary), notifications older than 90 days,
    and sessions expired or revoked over a day ago (the Day 8
    carry-over).
  - Works in bounded batches.
  - `POST /internal/cleanup[?dryRun=1]`, authorized by `CLEANUP_SECRET`
    (constant-time compare). It answers 404 when the secret is unset or
    wrong.
  - `.github/workflows/cleanup.yml` runs daily at 03:17 UTC, with a
    manual run and dry-run option. It skips with a notice until the
    secret exists.
  - `npm run cleanup [-- --dry-run]` runs the same work from a computer.
  - Migration 029 adds indexes for the time-based scans.
  - **Better than the plan:** dry-run mode and a command-line version,
    so the owner can preview before the first real run.
- **Tests at close:**
  - backend 366/366 (36 suites);
  - full browser run ALL PASSED: 23 suites, 375 checks, plus A3
    228/228 × EN/MY/AR;
  - golive-rehearsal --old PASSED (015→029).
- **LATER.md:** #4 added. The owner puts the same `CLEANUP_SECRET` on
  Render and in GitHub Actions secrets (after GO LIVE, since schedules
  run from `master`).

### 2026-09-29/30 — Day 10: Monitoring
- **Step 1 (`24deff3`):** built-in error log.
  - Migration 030 `error_groups` stores one row per distinct error with a
    count, so it can't grow unbounded.
  - Fed by every server 500, the error handler, socket handlers, process
    crashes and browser errors (`POST /client-errors`: capped,
    rate-limited, path-only).
  - A new top-level ErrorBoundary shows a translated "Something went
    wrong" screen instead of a white page.
  - Admin → Errors can list, show details, resolve and load more. An
    error re-opens if it happens again.
  - Optional Sentry via `SENTRY_DSN` (lazy).
  - **Found + fixed:**
    - a burst of repeats that then stopped was under-counted;
    - an error mentioning a just-deleted user was lost (FK);
    - "×2" showed as "2×" in Arabic;
    - my checklist edit broke the migration loop, and the rehearsal now
      checks the checklist's list against the files.
- **Step 2 (`3917f39`):** `GET /health` (DB check, 3 s timeout, reasons
  only logged), replacing `/test-db`.
  - JSON structured logs in production (pg `detail` never logged).
  - Per-request log line with the route pattern and `X-Request-Id`.
  - All 35 backend `console.*` calls now go through the logger, with a
    guard test.
  - **Found + fixed:**
    - **a crash when the DB drops an idle connection.** It predates
      today, and production very likely cold-restarted whenever Neon
      idled; `db.js` now handles pool errors, proven on a real server;
    - feed and three middleware 500s bypassed the error log.
- **Tests at close:**
  - backend 396/396 (38 suites);
  - full browser run ALL PASSED: 24 suites (day10-errors on the
    production build), 392 checks, plus A3 228/228 × EN/MY/AR;
  - golive-rehearsal --old PASSED (015→030).
- **LATER.md:** #5 added (optional Sentry). GO_LIVE_CHECKLIST lists
  migration 030 and checks `/health` and Admin → Errors.

### 2026-09-30 — Day 11: Bot protection
- **Step 1 (`43f2564`):** bot protection that needs no outside account.
  - **Honeypot field** on signup, login and forgot password. It is
    clipped rather than moved off-screen: a far-left offset scrolls
    sideways in Arabic.
  - **Signed form tokens** (HMAC with a purpose-derived key) with a
    minimum fill time: signup 3 s, forgot password 2 s. The forms wait
    out the rest themselves, and a stale token is replaced once without
    the person noticing.
  - **Login slows down** after 3 wrong passwords for one account: 1, 2, 4
    and 8 s. It resets on success.
    - **Better than the plan:** a delay alone doesn't stop parallel
      guessing, so at most 3 attempts per account may wait at once;
      extra ones get a 429.
    - Nobody is ever locked out: the right password always gets in.
  - **Tighter limits:** signup is now 5 an hour (was 10) plus 20 a day per
    network. Forgot password is also limited to 3 an hour per address,
    whatever network asks, which stops inbox-bombing.
  - **Where the checks run:** they are off under `NODE_ENV=test` unless
    `BOT_CHECKS_IN_TESTS=1`, like the rate limiters. The browser suite
    `day11-bots` runs its own stack with them on.
- **Step 2 (`0541c71`):** optional Cloudflare Turnstile, off until both
  keys are set (LATER.md #6).
  - It covers signup and forgot password, not login.
  - A missing or rejected token gets a 400. If Cloudflare can't be
    reached, the request goes through with a warning, so an outage
    can't stop signups.
  - Cloudflare's script loads only when the check is on.
  - The CSP allows its script and frame.
  - Tested without contacting Cloudflare: a fake widget is served from
    Cloudflare's URL on the production build, and a local stub does the
    verifying. Removing either CSP entry fails the suite.
- **Tests at close:**
  - backend 421/421 (40 suites);
  - mutation checks: 15 backend, 3 browser/CSP, all caught;
  - full browser run ALL PASSED: 26 suites and 447 checks (day10-errors
    and day11-turnstile on the production build, day11-bots with the
    checks on), plus A3 228/228 × EN/MY/AR.
- **GO_LIVE_CHECKLIST:** Turnstile rows in the env table, a Day 11 smoke
  check, and a note that the Day 2 login check is now slower after 3
  wrong passwords.

### 2026-09-30 — Day 12: Moderation
- **Step 1 (`6518fd9`):** report comments and messages.
  - **Migration 031:** `report_target_type` gains `comment` and
    `message`. Reports also keep `target_owner_id` and
    `target_snapshot`, the text as it was when reported, so editing or
    unsending doesn't erase the evidence. Posts keep them too.
  - **Messages:** only someone in that conversation can report one.
    Anyone else gets the same 404 as for a missing message, so nobody
    can probe private chats.
  - **Moderator view:** only the reported item is shown, never the rest
    of the chat. Voice and photos show inline. Banning the author
    resolves reports on everything they wrote.
  - **UI:** "Report" under other people's comments, and a flag beside
    their messages, in EN/MY/AR.
- **Step 2 (`d7d9903`):** admin report review.
  - The admin role, the list, dismiss, remove post and ban already
    existed (B12).
  - **Added:** removing a reported comment (its replies go with it) or
    message (removed like an unsend: media deleted from Cloudinary, and
    it disappears live from the open chat).
  - **Temporary suspensions (1/3/7/30 days, migration 032
    `users.banned_until`):**
    - A suspension lifts itself on the person's next request or login,
      or via the daily cleanup job.
    - A suspended login is told until when, in their language.
    - "Lift suspension" ends it early.
  - **Better than a separate suspension table:** a suspension is a ban
    with an end time. Every existing ban check (REST, optional auth,
    sockets, content hiding) covers suspensions with no new query.
  - **Rollback:** migration 032's down turns suspensions into permanent
    bans rather than silently unbanning people.
- **Tests at close:**
  - backend 445/445 (42 suites);
  - mutation checks: 16 backend, all caught;
  - golive-rehearsal --old PASSED (015→032). Both downs were also
    tested with live data;
  - full browser run ALL PASSED: 28 suites and 499 checks, plus A3
    228/228 × EN/MY/AR.
- **Found and fixed on the way:** the in-memory DM rate limiter's
  counters outlived test DB resets. Tests now get a reset hook.
- **Process note:** running mutation checks while a browser stack was
  booting crashed two suites. They passed on a clean rerun; that
  practice is now avoided.
- **GO_LIVE_CHECKLIST:** migrations 015 → 032, a post-check for the new
  columns, and a Day 12 smoke item.

### 2026-09-30/10-01 — Day 13: Test coverage
- **Step 1 (`89ff4b6`):** the browser suites run in CI.
  - The e2e scripts work on Windows and Linux. `pg.cjs` / `pg-tools.sh`
    find the PostgreSQL tools; ports are freed with taskkill or fuser;
    `E2E_EXTERNAL_DB=1` uses CI's Postgres service container.
  - `run-all.sh` takes `E2E_ONLY` (an unknown name stops the run).
  - **Better than running everything on every push:** the repo is
    private, with 2000 CI minutes a month. So "Browser tests (smoke)"
    runs 4 key suites on every push, and "Browser tests (full)" runs on
    PRs to master and by hand, with Noto fonts for MY/AR.
  - `ciWorkflow.test.js` guards the workflow against the scripts.
  - **Not verifiable here:** the first real Linux run (no WSL or
    Docker), which is an owner check (LATER #1). The same command passed
    locally in external-DB mode.
- **Step 2 (`5d2caa9`):** Vitest + React Testing Library.
  - 30 component and unit tests: utils (incl. safeUrl), useFormGuard,
    ReportDialog, MessageBubble, CommentSection, Modal, ErrorBoundary
    and Login. CI's frontend job runs them.
  - **Real bug found and fixed:** Modal re-focused its panel on every
    parent render, so text fields inside dialogs (report details,
    account-deletion confirm) only took one letter. The browser suites
    missed it because Playwright's `fill()` sets the whole value at once.
    - Guarded by Modal tests that fail on the old code.
    - day12-report now types key by key.
  - `npm audit fix` cleared one advisory (brace-expansion, via eslint).
- **Flaky test fixed at close:** day11-bots once read the login form
  before it had rendered after signup (MY). It now waits for the login
  heading and logs the error text if it fails.
- **Tests at close:**
  - backend 454/454; Vitest 30/30.
  - Full browser run ALL PASSED: 28 suites and 499 checks, plus A3
    228/228 × EN/MY/AR.
  - The run was done in 5 foreground batches: the background run was
    killed by Claude Code for low memory.
  - In batch 1, b1-reactions and b2-media failed because their stack
    could not reach the database (machine low on memory, ~2 GB free of
    8). Both passed on an immediate rerun.

### 2026-10-01 — Day 14: GO LIVE #2 (skipped) + buffer
- **GO LIVE skipped:** there is no production access (CLAUDE.md hard
  limits). It stays an owner action (LATER.md #2, updated).
- **Buffer:** nothing is left from Week 2 apart from the owner-only GO
  LIVE boxes (Day 1's remote-CI check, Day 7). The GO LIVE rehearsal was
  re-run on the current `dev` (Days 1–13):
  - migrations 015 → 032 up, down and up;
  - the schema matches the app's (171 columns, 97 constraints);
  - data is kept;
  - the old and new code both pass the API smoke test;
  - the checklist's migration list is exact.
  - REHEARSAL PASSED. GO_LIVE_CHECKLIST's "last run" was updated.
- No code changed, so no new test run was needed beyond the rehearsal.
  Day 13's full browser run (the same code) is green.

### 2026-10-01 — Day 15: i18n framework (verified)
- **Step (`82716f5`):** react-i18next has been in place since B15, with
  lazy MY/AR bundles and `check:i18n` (838 keys in each language, plural
  forms, no unknown references).
  - An audit for UI text outside the translation files found English
    only in nine dead files: PostActions/PostHeader/PostMedia/LikeButton/
    MoreButton/CommentButton (replaced by PostCard) and a never-mounted
    FeedActions context/provider/hook.
  - Removed, with the CSS only they used.
- **Found at close:** day8-sessions-list once logged two 401s, all checks
  passing. Settings → Log Out waited for the server to revoke the
  session before clearing the token here, so a poll fired during that
  round trip went out with a revoked token.
  - **Fix:** `clearLocalSession()` runs first, then the server logout
    with the captured token, then the redirect.
  - Unit test added. The suite passed 3/3 afterwards.
- **Tests at close:**
  - backend 454/454; Vitest 31/31.
  - Full browser run (Day 15 code): all 28 suites and A3 EN/MY/AR green,
    run in foreground batches. day8-sessions-list, b11-settings and
    day8-sessions were re-run after the logout fix.

### 2026-10-01/03 — Day 16: Myanmar (+ language per account)
- **Already there since B15:** Myanmar translations (`check:i18n`: 839
  keys × EN/MY/AR), the Noto Sans Myanmar font (unicode-range: it loads
  only for Burmese text), and the Language switcher in Settings plus the
  landing page.
- **Built (`3e94305`, `695e37e`):** the "save choice per user" part.
  - Migration 033 adds `users.language`. `PUT /profile/language`;
    `/profile/me` and `/login` return it; signup keeps a language that
    was picked.
  - **Better than the first version:** the first cut saved the device's
    language at the first login. Most devices are just on their default
    (English), so a later login on an Arabic device switched it to
    English (caught by day8-sessions-list at the Day close).
  - **Now only languages the person actually picks reach the account:**
    - picked while logged in → saved at once;
    - picked while logged out → pending on that device, wins at the next
      login there and is saved;
    - otherwise the account's language is applied.
  - Copy (hint, privacy policy) updated in EN/MY/AR.
- **Also fixed (`444ac47`):** logging out from Settings sent one
  token-less `/profile/me` (PrivacyToggle re-fetched when the token was
  cleared) → a 401. This was the real cause of day8-sessions-list's
  occasional 401, which Day 15's fix only partly addressed. The suite
  now records which URL got a 401.
- **Tests at close:**
  - backend 459/459 (5 mutations caught); Vitest 40/40.
  - Rehearsal 015 → 033 PASSED.
  - Full browser run: 29 suites + A3 EN/MY/AR green, in batches.
  - Batch 2 was re-run after the internet dropped mid-run (Google Fonts
    errors).
- **Follow-up noted:** routes have no auth guard, so auth-only screens
  re-render briefly with no token on a forced logout. Low impact (that
  path reloads to /login).

### 2026-10-03 — Day 17: Arabic + RTL (verified)
- **Already built in B16, now verified:**
  - Arabic translations: 839 keys, all plural forms (zero/one/two/few/
    many/other).
  - `dir="rtl"` follows the language.
  - Audit for physical CSS (`left`/`right`, `margin-left`,
    `text-align: left`, …): none left in live styles. The only hits were
    the unused Vite template `App.css` (never imported; removed) and
    `text-align: left` on admin stack traces, which carry `dir="ltr"` on
    purpose.
  - Direction-aware logic is in place:
    - the media carousel scrolls toward negative scrollLeft;
    - voice seek and slide-to-cancel measure from the start edge;
    - arrow keys follow what the user sees (utils/direction.js);
    - icons that point (back, reply, send, log out) are mirrored;
    - switches and story progress run from the start edge.
  - Arabic is re-checked on every screen by the A3 matrix (228 page
    checks) and in each new suite since (Days 10–16 all test AR at
    375–430px).
- **Tests:** lint, build, Vitest 40/40, b16-rtl, b15-lang and A3
  EN/MY/AR green.
  - **Day-end full run:** not repeated. The built app is byte-for-byte
    the one that passed Day 16's full run the same day (`App.css` was
    never imported), and the RTL suites above were re-run.

### 2026-10-03 — Day 18: Comment replies + reactions (already built)
- Both tasks say "if missing", and both exist.
  - **Threaded replies and comment likes (B4):** one reply level, with
    reply-to-reply landing in the same thread, and notifications.
  - **Reactions beyond like (B1):** six reactions, old likes count as
    reactions (migration 016).
- **Verified on today's code:** commentThreads + reaction API tests
  20/20; browser suites b1-reactions 14/14 and b4-comments 15/15.
- No code changed, so no new full run: the same code passed Day 16's
  full run.

### 2026-10-03 — Day 19: Link previews + share cards
- **Step 1 (`4866742`):** link previews.
  - **Found first:** URLs in posts, comments and messages weren't even
    clickable. Now they are links: http(s) only, a new tab,
    `rel="noopener noreferrer nofollow ugc"`, trailing punctuation left
    out, LTR inside Arabic text.
  - **The server fetches the linked page** (`GET /link-preview`), so the
    reader's browser never contacts the site. SSRF protection:
    - http(s) on ports 80/443 only, no credentials in the URL;
    - every resolved address must be public (all v4/v6 special ranges,
      including IPv4-mapped/NAT64/6to4 forms);
    - the connection is pinned to the checked address (no DNS
      rebinding);
    - redirects are followed by hand, max 3, each re-checked;
    - 5 s, 512 KB, HTML only.
  - **Cache:** `link_previews` (migration 034); good results for 7 days,
    failures for 1 h; the cleanup job drops rows older than 30 days.
  - **Card:** site, title, description, under posts without photos and
    in text messages.
    - **Better than a site-image card:** no og:image. Loading the
      site's image would tell it who is reading, and would need a wider
      CSP.
    - Replaces a dead `post.linkPreview` placeholder in PostCard.
- **Step 2 (`b69562d`):** Open Graph share cards.
  - `GET /share/posts/:id` serves the post's og:/twitter: tags (author
    or page, text excerpt, first photo) and a redirect for people.
  - vercel.json rewrites crawler user-agents on `/posts/:id` to it, so
    shared links keep the app's domain. check-headers verifies the
    rewrite target.
  - Only publicly visible posts get a real card; everything else gets
    the same generic card, which reveals nothing.
  - serve-dist emulates the rewrite, so the dist suite tests the real
    vercel.json.
- **Tests at close:**
  - backend 526/526: linkPreview 59 tests, 10 safeguard mutations
    caught; share 10 tests.
  - Vitest 50/50; rehearsal 015 → 034 PASSED.
  - Full browser run: 32 suites (new: day19-links, day19-share) + A3
    EN/MY/AR, all green on the first pass.
- **Owner:** GO_LIVE_CHECKLIST has a Day 19 smoke item (Facebook Sharing
  Debugger / Telegram paste).

### 2026-10-03 — Day 20: Posts upgrade
- **Multiple images per post:** exists since B2; verified (media +
  postVisibility tests, b2-media).
- **"Only me" audience (`ae101e6`):** migration 035 adds `only_me`.
  - **Hidden from everyone but the author on every read path:**
    - getVisiblePost (post page, likes, comments, bookmarks, share
      cards);
    - the follower clause of /posts, /feed, profile tabs, explore,
      hashtags, search and bookmarks;
    - notification snippets.
  - UI: composer option, a lock on the card, and the post menu offers
    the other two audiences.
  - **Rollback safety (better than a plain down):** the older code
    treats any audience but 'followers' as public. So 035's down
    refuses while "only me" posts exist, and explains the options.
    GO_LIVE rollback notes were updated.
  - **Also fixed:** mentions now notify only people who can see the
    post. Before, a followers-only post's @mention notified
    non-followers too.
- **Self-caught:**
  - The first draft of onlyMe.test.js hit two non-existent routes
    (/search, /explore) and passed vacuously. Positive controls exposed
    it, and all 10 filter mutations are caught now.
  - At the Day close, b14-pages caught a regression: renaming the
    menu's audience keys let audience items appear on page and group
    posts. Fixed in `bb95ee3`, with PostMenu.test.jsx.
- **Tests at close:**
  - backend 537/537; Vitest 54/54.
  - Rehearsal 015 → 035 PASSED.
  - Full browser run: 33 suites + A3 EN/MY/AR green.

### 2026-10-03 — Day 21: GO LIVE #3 (skipped) + buffer
- **GO LIVE:** skipped again, since there is no production access. It
  stays an owner action (LATER.md #2, updated for Days 1–20 and
  migrations 015 → 035).
- **Buffer:** nothing is left from Week 3 apart from the owner's GO LIVE.
  The rehearsal (015 → 035, schema match, data kept, downs/ups, old and
  new API smoke) passed today on the same backend.
- GO_LIVE_CHECKLIST's "last run" was updated. It already has smoke items
  for Days 19–20 and the "only me" rollback warning.

### 2026-10-03 — Day 22: Push notifications
- **Web push (`25ee487`):** VAPID, through the existing service worker.
  It's off until the owner generates keys locally and sets them; no
  account needed (LATER #7).
  - **Subscriptions:** migration 036. Only https endpoints at the
    browsers' push services are accepted, as exact hosts or real
    subdomains (SSRF: the server POSTs to them). The newest 10 devices
    per person are kept, and 404/410 from a push service removes one.
  - **What is pushed:** every notification that is actually created
    (so the per-type settings apply), mentions, and new messages.
    Messages go only to people not in the app right now (no live
    socket), and never include the message text (lock screens). Text is
    in the recipient's language (Day 16).
  - **Better than calling the library's send directly:** `web-push`
    only speaks https, so it builds the encrypted, signed request and a
    tiny sender delivers it. That made a real end-to-end test against a
    local stub push service possible.
  - **UI:** the "Push notifications on this device" switch in Settings →
    Notifications. It's hidden when the browser or server can't do push,
    and explains blocked permission. Logging out unsubscribes the device.
    Service worker: tag per post/conversation; a tap opens that page of
    this site.
- **Tests at close:**
  - backend 552/552; Vitest 60/60.
  - Rehearsal 015 → 036 PASSED.
  - Full browser run: 35 suites (new: day22-push, end to end with real
    encryption) + A3 EN/MY/AR green.

### 2026-10-03 — Day 23: Notification settings
- **Already there (B11):** per-type switches for likes, comments,
  mentions, follows and accepted requests.
- **Added (`3fad351`):**
  - **A "Messages" switch:** `notification_preferences.messages`,
    migration 037.
  - **Muting a chat:** `conversation_participants.muted_until` for
    8 hours, 1 week, or until turned back on (`'infinity'`).
    `PUT /conversations/:id/mute` is for participants only (others get
    the same 404 as a missing chat). The SQL interval comes from a fixed
    map, never from input.
  - Message pushes skip people who turned messages off or muted the
    chat. Unread badges stay, as in other apps.
  - **UI:** a bell in the chat header (mute sheet / unmute), a bell-off
    icon on muted chats in the inbox, and the new row in Notification
    settings. EN/MY/AR.
- **Tests at close:**
  - backend 559/559 (3 filter mutations caught); Vitest 60/60.
  - Rehearsal 015 → 037 PASSED.
  - Full browser run: 36 suites (new: day23-mute) + A3 EN/MY/AR green.
    b11-settings now expects 6 switches.

### 2026-10-03/05 — Days 24–25: Next P1 items from the audit
- **What was picked:** the P1 list was mostly done already (sessions,
  push, error log, Turnstile, comment/message reports, cleanup, link
  previews, post share cards, headers, CI). Others are on later Days
  (accessibility 26, data export 28, content filter ~47, 2FA 77). That
  left three items:
  1. **Report groups and pages (`3254d7c`):** migration 038.
     - A private group can be reported only by its members (others get
       the same 404 as a missing group), and not your own.
     - The name and description are kept as reported, and the owner is
       recorded, so banning them resolves these reports too.
     - Admin cards show the group or page, and Remove deletes it with
       its posts and photos, after a confirm.
     - A Report button is on the group and page screens.
  2. **Share cards for profiles and pages (`5823472`):** profiles, by id
     or username, only when public and active; pages are hidden when
     their owner is deactivated. vercel.json crawler rewrites were added.
  3. **Self-hosted fonts (`a1e8530`):**
     - @fontsource with unicode-range subsets, so there's no request to
       Google per visitor.
     - The CSP is now `style-src 'self'; font-src 'self'`, and fonts are
       never inlined.
     - check-headers guards both, and the dist suite proves the fonts
       load from this site.
- **Tests at close:**
  - backend 567/567; Vitest 60/60.
  - Rehearsal 015 → 038; 038 down tested with data.
  - Full browser run: all 38 suites + A3 EN/MY/AR green.

### 2026-10-05 — Day 26: Accessibility
- **Audit (`9cf9e5d`):** new suite `e2e/day26-a11y.cjs` runs axe-core
  (WCAG 2.1 A + AA) on every route, light and dark, in EN, and on the
  main screens in MY and AR (RTL), at 390px — 88 page checks. It fails
  on any serious or critical violation; `AXE_DETAIL=1` lists each
  failing contrast pair.
- **Found:** only colour contrast (66 page checks). Labels, alt text,
  button/link names and ARIA already passed.
- **Fixed at the tokens, not per element:**
  - Muted text #646b77 in light mode (was #8a8f98, 2.9:1) and #9aa1b0
    in dark mode (was #80899a).
  - New `--color-accent-text` / `--color-accent-2-text`: the same as the
    fills in light mode, lighter in dark mode (#a5b4fc / #22d3ee), used
    by every `color: var(--color-accent)` rule. Buttons with white text
    keep `--color-accent`.
  - Log-out button text #b91c1c.
- **Keyboard:** the suite also Tabs through /welcome, /login, /,
  /settings and /messages/1, and needs a visible focus ring at every
  stop and focus never lost to the page. A mutation that hides every
  focus ring makes it fail.
- **Tests at close:**
  - backend 567/567; Vitest 60/60; eslint clean.
  - Full browser run: all 36 suites (new: day26-a11y) + A3 EN/MY/AR
    green.

### 2026-10-05 — Day 27: Performance
- **Measured, not guessed (`c9eb578`):** new suite `e2e/day27-perf.cjs`
  seeds about a million realistic rows (30k users, a year of posts,
  3,000 hashtags of skewed size, read marks, long chat histories) and
  calls 30 read endpoints. It fails if a request makes Postgres scan a
  table over 4 MB end to end, or read over 20k rows, using Postgres' own
  counters (deterministic); timings are only printed.
- **Found a hidden drift:** the dev/test fixture had none of the indexes
  production got from 001–014, 015, 018, 019 and 022 (it was built from
  columns and constraints only). My first draft of 039 would have
  duplicated a dozen live indexes, and its down would have dropped
  022's. The fixture now has them all, and the rehearsal compares
  indexes too (84 match), with 003–014's in its model of the live
  database.
- **Migration 039 (only what production lacks):**
  `messages(conversation_id, id)`, `post_hashtags(hashtag_id, post_id)`
  (replaces 010's), `conversation_participants(last_read_message_id)`,
  `story_views(viewer_id)`.
- **Query shapes:**
  - Inbox unread counts: `id > COALESCE(last_read, 0)`, a range scan (it
    read every message of every conversation).
  - Hashtag page: the tag id is looked up first, and posts are ordered by
    post id, so a popular tag reads ~30 rows instead of 15k.
  - Suggestions: friends-of-friends as a LATERAL per-person lookup (the
    planner sometimes scanned all 300k follows).
  - Mutations: without 039 the hashtag page and inbox exceed 20k rows;
    hashtagPage.test.js catches a wrong order.
- **Images (`51d084e`):** ui/Avatar (most avatars) downloaded the
  original upload; it now gets a square crop at 1x/2x/3x, lazily. Feed
  images have a 320–1440px srcset sized for the 480px column; story, DM,
  search and admin images are sized too.
- **Bundle (`07cebb1`):** screens were already code-split. The first
  download was 225 kB gzipped. socket.io-client now loads only after
  login, which brings it to 212.6 kB. `npm run check:bundle` (in CI)
  enforces a 225 kB budget and keeps translations and the chat client
  out of the first download.
- **Not done:** explore still aggregates the last 7 days per request
  (~5.7k rows at the perf seed). That's fine at this size; precompute it
  in Phase 2 when traffic justifies it (WIP carry-over note).
- **Tests at close:**
  - backend 570/570; Vitest 65/65; eslint clean.
  - Rehearsal 015 → 039 passed.
  - Full browser run: all 37 suites (new: day27-perf) + A3 EN/MY/AR
    green.

### 2026-10-05 — Day 28: Privacy
- **Download your information (`280818c`):**
  - `GET /profile/export` returns a JSON file of everything the account
    made or owns (services/dataExportService.js, one query per section,
    5 downloads an hour). It's under Settings → Security & Privacy, with
    pending, done and error states in EN/MY/AR.
  - Never in it: password hash or tokens, session ids, push endpoints
    and keys, other people's private fields, who blocked or reported the
    account, chats it isn't in.
  - Deleted messages appear only as markers, without their text.
  - Better approach than a plain dump: story viewers are exported as a
    count only, because the app never names them to the owner, so the
    export mustn't either.
  - Tests: dataExport.test.js (7) plus a rate-limit case; mutations
    (leaking other chats, dumping the whole user row) are caught.
    Browser suite day28-export (12): the real file download, its
    contents, a refused download, dark mode, Arabic RTL.
- **Privacy Policy (`e613c47`):** rewritten from the code, 11 sections in
  EN/MY/AR. Every statement was checked against its implementation:
  - stories, "Only me", devices signed in, last active;
  - link previews (our server fetches the page) and share cards (public
    content only);
  - all providers, including browser push services (pushes never carry
    message text), Turnstile and Sentry; fonts are self-hosted;
  - the device cache holds app files only;
  - retention periods, the data download, and the under-13 rule;
  - the privacy policy has its own "last updated" date; the Terms keep
    theirs.
- **Owner note:** the retention promises need the cleanup job switched
  on before launch; this was added to LATER.md #4. The policy is still
  marked as a draft for the owner's review.
- **Tests at close:**
  - backend 578/578 (one failure in one run didn't repeat in 3 reruns;
    noted in WIP to watch); Vitest 65/65; eslint and check:i18n clean;
    bundle 213.8 kB.
  - Full browser run: all 38 suites (new: day28-export) + A3 EN/MY/AR
    green.

### 2026-10-05 — Day 29: Re-audit
- **AUDIT_REPORT_2.md**, read-only (no app code changed), compared with
  the first audit:
  - All 12 first-audit bugs are fixed on `dev`, with the commits and
    tests as evidence.
  - Two still need the owner: email needs a Brevo key, and cleanup needs
    its secret.
  - #1 (the proxy rate limit) is still live until GO LIVE.
- **Method:**
  - A script classified all 121 routes: 80 login, 8 admin, 19 optional,
    1 secret, 13 intentionally public.
  - 32/32 fresh probes passed on the endpoints added since the first
    audit (export, only-me, share-card escaping, SSRF, push, sessions,
    mute, sockets, admin/internal, banned users, private accounts,
    headers).
  - 6 obfuscated loopback URLs never reached a local listener.
  - `npm audit` (production dependencies): 0 vulnerabilities.
  - Test numbers come from the full verification of the audited commit
    `61969ae` (the Day 28 close the same day).
- **New findings:**
  - N1 Medium: protected screens render for logged-out visitors (no
    route guard; the API refuses, so nothing leaks).
  - N2 Low: one unrepeated backend test failure.
  - N3 Low: explore aggregates 7 days per request.
  - N4 Low: dead code (PostContent.jsx, 3 template assets).
  - N5/N6 Info: frontend console calls; the token in localStorage,
    mitigated by the CSP.
- **Top risk:** production still runs the Sep 22 code, 144 commits
  behind (owner GO LIVE, fully rehearsed).
- **Next (Day 30):** GO LIVE is an owner action; the owner-free part is
  fixing N1, N2 and N4.

### 2026-10-06 — Day 30: GO LIVE #4 skipped; AUDIT_REPORT_2 top items fixed
- **GO LIVE:** skipped (no production access; LATER.md #2). The
  rehearsal for 015 → 039 passed on Day 29.
- **N1, route guard (`6f8a373`):**
  - Before: 22 account-only routes (settings, messages, saved,
    create/edit screens, admin, group and page management) rendered
    their UI to logged-out visitors, whose every request was then
    refused.
  - `RequireAuth` now sends visitors to Login, keeping the wanted page
    in router state (no URL parameter, so no open redirect). Login
    returns there afterwards; `safeReturnPath` accepts only in-app
    paths.
  - It's reactive, which also closes the Day 16 note: a revoked session
    or a logout on these screens ends on Login.
  - Public browsing (posts, profiles, pages, groups, hashtags, explore,
    search, legal, language) is unchanged.
  - Tests: RequireAuth.test.jsx (5; an always-render mutation is
    caught); browser suite day30-guard (9): 22 routes with 0 refused
    calls, 14 public routes, return after login, a revoked session.
- **N4, dead code (`202c830`):** PostContent.jsx and 3 Vite template
  images were removed.
- **N2, flaky test (`2ead62a`):**
  - Caught by looping the backend suite: botProtection.test.js "forged"
    a token by replacing the signature's last character with 'A'. That's
    the real signature 1 time in 16, because base64's last character
    carries only 4 bits.
  - Measured: 244/4000 accepted before, 0/4000 after (the first
    character is swapped instead).
  - The code was right; only the test was wrong. It then passed 30/30
    runs.
- **Left for later:** N3 (precomputed trending) goes to Days 40–41
  Explore; N5/N6 are informational.
- **Tests at close:**
  - backend 578/578 (several full runs); Vitest 70/70.
  - Full browser run: all 39 suites (new: day30-guard) + A3 EN/MY/AR
    green.

### 2026-10-06 — Days 31–32: Messaging upgrade
- **Already built (B9), verified:** reply, edit (15 minutes), unsend
  (dm/dmExtras tests, E2E b9-dm).
- **Reactions (`e8ea677`):**
  - Migration 040 `message_reactions`: one reaction per person per
    message, the six post reactions.
  - `PUT/DELETE /conversations/:id/messages/:messageId/reaction`:
    people in the chat only; not an unsent message (409); not across a
    block (403); its own limiter, separate from the send budget.
  - Socket `message_reaction` carries the full list. Unsending or a
    moderator removal clears reactions, and the data download lists
    yours.
  - UI: a React button and a 6-emoji picker (keyboard, Escape,
    outside click). The picker opens below the bubble when the chat
    header would cover it, which the browser suite found. A pill on the
    bubble names who reacted.
- **Forward (`ef3b57e`):**
  - Migration 041 `messages.is_forwarded`; forwards to up to 5 chats.
  - Each forward goes through the normal send path (membership,
    blocks, send rate limit, push) and succeeds or fails on its own.
  - The original author isn't revealed (like WhatsApp).
  - Better approach than sharing the file: a photo or voice note on our
    Cloudinary is copied per forward. Unsending, account deletion and
    the orphan scan then stay correct with no reference counting, at
    the cost of one upload per media forward (bounded by the 5-chat cap
    and send limits).
  - UI: a forward sheet (search, up to 5, partial failures named) and a
    "Forwarded" label. The browser suite caught the sheet's missing
    padding and RTL name alignment.
- **Rule change:** the MONTH_PLAN PAUSE step now says a step report is
  followed immediately by the next step in the same turn.
- **Tests at close:**
  - backend 598/598; Vitest 82/82.
  - Rehearsal 015 → 041.
  - Full browser run: all 41 suites (new: day31-reactions,
    day32-forward) + A3 EN/MY/AR green.

### 2026-10-06 — Days 33–35: Group chats
- **Already built (B10), verified:** create, add/remove members, leave,
  rename (admins), automatic admin hand-over when the last admin
  leaves, live `group_updated` (groups.test.js, E2E b10-groups).
- **Admins (`555d1d0`):**
  - `PATCH /conversations/:id/members/:userId { role }`: admins make or
    remove admins, including themselves. A group always keeps one admin
    (409).
  - Better approach: one statement that locks the group's rows, so two
    admins demoting each other at once can't leave none. A plain HTTP
    race test passed 10/10 without the lock, so the lock is proven by a
    two-connection test instead.
  - UI: one Options sheet per member (Make admin / Remove as admin /
    Remove; Step down on your own row), replacing the per-row Remove
    button. b10-groups was updated for it.
- **Group photo (`8e41022`):**
  - Migration 042 `conversations.avatar_url`; `PUT/DELETE
    /conversations/:id/photo`. Admins only, checked before the upload,
    so a refused request never uploads.
  - The old file is deleted on replace or remove and with the group.
  - Found while building: the orphan scan would have treated group
    photos as orphans and deleted them. They now count as in use, and a
    new test checks that every folder the routes upload into is
    scanned.
  - `GroupAvatar` shows in the inbox, chat header and group info.
- **Tests at close:**
  - backend 612/612; Vitest 84/84.
  - Rehearsal 015 → 042.
  - Full browser run: all 43 suites (new: day33-group-admins,
    day34-group-photo) + A3 EN/MY/AR green.

### 2026-10-06 — Day 36: Profile upgrade
- **Links and joined date (`d969bbc`):**
  - Migration 043 `users.links`: up to 3, public like the bio.
  - `utils/profileLinks.js` allows http(s) only. It refuses
    `javascript:`, `data:`, `mailto:`, `ftp:` and `javascript://host`
    tricks, and credentials in the address. It adds `https://` when
    missing, keeps host:port, and removes duplicates.
  - Links are checked again before going into an href, open in a new
    tab with `rel=noopener noreferrer nofollow ugc`, and stay
    left-to-right in RTL.
  - "Joined <month year>" uses a new `formatDate` style with a Burmese
    fallback.
  - The first refusal test missed `javascript://host`, so a mutation
    survived; the test was strengthened.
- **Cover photo (`17f1a89`):**
  - Migration 044 `users.cover_url`; `PUT/DELETE /profile/cover`. The
    old file is deleted on replace or remove and with the account.
  - The orphan scan knows covers (folder and column); both mutations
    are caught.
  - A 3:1 banner, with the avatar overlapping it.
  - The Privacy Policy now lists cover photo and links. The legal
    browser tests read the policy date from the app instead of pinning
    it.
- **Pinned post (`0684753`):**
  - Migration 045 `users.pinned_post_id` (SET NULL, partial index).
  - Only your own post that's on your profile can be pinned.
  - Better approach than an expression sort: page 1 returns the pin
    separately (visibility still applies), and the list excludes it.
    The list keeps its index order (the perf suite still reads 5 rows),
    and the pin never appears twice.
  - "Pinned" label; Pin/Unpin in your own posts' menus.
- **Process note:** step 3's plan was written after the first build edits;
  it was caught up in WIP before testing.
- **Tests at close:**
  - backend 630/630; Vitest 94/94.
  - Rehearsal 015 → 045.
  - Full browser run: all 46 suites (new: day36-profile, day36-cover,
    day36-pinned) + A3 EN/MY/AR green.

### 2026-10-06 — Days 37–38: Friends
- **Already built, verified:** send / accept / decline / cancel exist as
  follow requests to private accounts (cancel = unfollow while pending;
  follow.test.js, E2E b11/a2).
- **Better approach than a second relationship:**
  - Friends = people who follow each other (both follows accepted),
    like Instagram/X "mutuals".
  - There's one graph, the one privacy, feeds, blocks and suggestions
    already use. A separate friendship table would duplicate every rule
    and confuse "friend" with "follow".
- **Backend (`c260c7b`):**
  - `GET /users/:id/connections?type=friends|followers|following`: A-Z
    pages, each row with the viewer's relation.
  - `GET /users/:id/mutual-friends`: count plus a sample of 3.
  - `friendsCount` added to the counts.
  - Fixed: deactivated accounts were still listed and counted in
    followers/following; now hidden everywhere.
  - The perf suite covers the new endpoints.
- **App (`07898b9`):**
  - Counts link to a Connections screen (tabs, keyboard, Load more,
    private explanation), public like profiles.
  - Follow / Follow back / Requested / Following buttons.
  - "N mutual friends: …" on other people's profiles.
  - Counts are proper plurals now ("1 follower" used to read "1
    followers").
  - The a11y audit covers the new screen.
- **Tests at close:**
  - backend 639/639; Vitest 98/98.
  - Full browser run: all 47 suites (new: day37-friends) + A3 EN/MY/AR
    green.

### 2026-10-06 — Day 39: People you may know
- **Already built, verified (B8):** friends-of-friends ranked by mutual
  count with a sample, a boost for people who follow you, exclusions
  (yourself, followed/requested, blocked, deactivated), a popular
  fallback, no outside service (suggestions.test.js, E2E b8-pymk).
- **Gap filled (`1795672`): hide a suggestion**, like the X on
  Facebook/Instagram cards.
  - Migration 046 `suggestion_dismissals` (both FKs cascade).
  - `POST /users/suggestions/:id/dismiss`: private (no block, unfollow
    or notification), idempotent; 400 for yourself, 404 for unknown.
    Hidden people are left out of network and popular suggestions.
  - X on each card: the card goes at once and comes back with a
    message if the server refuses. EN/MY/AR, end corner in RTL.
  - The data download and the Privacy Policy list hidden suggestions.
- **Tests at close:**
  - backend 644/644; Vitest 100/100; rehearsal 015→046 passed.
  - Full browser run: all 48 suites (new: day39-pymk) + A3 EN/MY/AR
    (228 page checks each) green.

### 2026-10-07 — Days 40–41: Explore page
- **Already built, verified (B7):** trending hashtags (7 days, public
  posts only, blocks hidden), popular posts (engagement with time
  decay), a feed per hashtag (explore.test.js, hashtagPage.test.js, E2E
  b7-explore).
- **Top and Recent on hashtag pages (`e509928`)**, like Instagram/X:
  - `?sort=top` ranks the tag's newest 500 visible posts by the
    Explore score, now one shared formula (`services/popularity.js`).
  - Bounded on purpose: 1,033 rows on the perf seed's 15k-post tag; a
    "last 30 days" window would read the tag's whole history.
  - Tabs open on Top, live in the URL, work by keyboard and in RTL.
- **Trending cache, audit N3 (`8e157b4`):**
  - One list, cached 60 s, shared by visitors and everyone without
    blocks; viewers with blocks still get an exact live list.
  - Not a table refreshed by the daily job: trends would be a day
    stale. Off in browser test stacks (`TRENDING_CACHE_MS` turns it on).
- **Noted for later:** post cards show a comment count only once the
  comments are opened (app-wide; WIP carry-over).
- **Tests at close:**
  - backend 654/654; Vitest 103/103.
  - Full browser run: all 49 suites (new: day40-hashtag-top) + A3
    EN/MY/AR (228 page checks each) green.

### 2026-10-07 — Day 42: Better search
- **Before:** username/content ILIKE on trigram indexes, newest first;
  no ranking, hashtags, history or filters.
- **Key choice:** Burmese has no spaces between words, so Postgres
  full-text search alone would break Burmese search. Posts match
  full-text (English stemming) OR the old substring match.
- **Ranked search (`521a332`):**
  - Migration 047: GIN index on `to_tsvector('english', content)`.
  - Posts: the newest 500 matches, ranked by relevance (ts_rank_cd +
    whole-phrase bonus) x popularity x freshness. Perf: a word in 150k
    posts reads 1,061 rows / 46 ms.
  - People: exact > prefix > people you follow > shorter names; the
    Follow button starts in the right state.
  - Found and fixed: `%` and `_` acted as wildcards in search
    (`utils/escapeLike`, now shared with groups/pages).
- **Hashtags + tabs (`2e3cf75`):**
  - `/search/hashtags` (migration 048, trigram on LOWER(tag)): exact >
    prefix > by use; public posts only; counts capped at "500+".
  - Tabs All / People / Posts / Hashtags live in the URL (`?q=&type=`),
    so Back and reload keep them; the newest query always wins.
  - Found and fixed: trending could plan a full post_hashtags scan on a
    table that wasn't freshly vacuumed; the Following button's contrast
    was 4:1.
- **Recent searches (`4540462`):**
  - Migration 049 `search_history`: one row per query (any case), the
    newest 20 kept, private to the owner (others get 404).
  - Saved on submit or tap, not when a search is opened from a link.
    Remove one (optimistic, rolls back on error) or Clear all.
  - In the data download, the Privacy Policy (EN/MY/AR) and account
    deletion.
- **Found at close:** the A3 visual suite clicked "Search" in Arabic by
  substring and also hit the new remove button's label; fixed with
  `exact: true` (test only).
- **Tests at close:**
  - backend 676/676; Vitest 116/116; rehearsal 015 → 049.
  - Full browser run: all 50 suites (new: day42-search) + A3 EN/MY/AR
    (228 page checks each) green. Run in batches: one MY run lost its
    Chromium tab to low memory and passed on rerun.

### 2026-10-07 — Day 43: Myanmar text support
- **Library:** Google's `myanmar-tools` (offline, Apache-2.0), pinned to
  1.1.3. 1.2.0 on npm is published without its build and can't load.
  - Measured on its own paired corpora: every Zawgyi line scores ≥ 0.992,
    every Unicode line ≤ 0.001.
  - Converting Unicode by mistake corrupts it, so a line is only
    converted at ≥ 0.95. Ambiguous short lines follow the whole text.
- **Convert on write (`6177e1d`):** posts, comments, messages (send,
  caption, edit; HTTP and socket), bio, group-chat / group / page names
  and descriptions, report details.
  - Storage, search, hashtags, mentions and notifications all see
    Unicode, whatever font the writer has.
  - Not usernames: they are how people find and mention you.
  - New length limits where there were none (a multipart post could be
    1 MB): post 10,000, comment 5,000, bio 500. Bio is generous so
    existing bios still save. Limits count the text as typed, since
    conversion can lengthen it.
  - The fields got matching `maxLength`, with MY/AR for the new errors.
  - Found and fixed: four screens kept the locally typed text after a
    save (comment edit, REST message edit and its quotes, bio, page
    form). They now show the server's text.
- **Search (`d36c44a`):** Zawgyi queries for posts, hashtags, groups and
  pages are converted, and recent searches are kept in Unicode.
  - People search matches a name as typed OR converted, because
    usernames aren't converted.
- **Burmese hashtags and @mentions (`632c5ee`):** both sides were ASCII
  `\w` only, so `#ရန်ကုန်`, `#مرحبا` and `@ကိုကို` never worked.
  - Now letters, marks and digits of any script. Burmese `။ ၊` end a
    tag, and `#၁၂၃` is not one.
  - Tags are NFC-normalized, so the same word with marks in another
    order is one tag.
- **Backfill (`5d38560`):** `npm run convert:zawgyi` is a dry run;
  `-- --apply` converts.
  - Only rows still holding the text that was read are written. No
    edit time is set.
  - Values too long for their column once converted are listed, not
    written. Duplicate recent searches are merged. Posts with stale
    tags are re-indexed.
  - Run for real on the e2e database: dry run, apply, then a re-run
    that finds nothing.
  - Found and fixed: a search that only passes 100 characters once
    converted was a database error (500); it's now a 400.
- **Better approach than the plan:** the plan said "posts, comments,
  messages, search". All free text people write is converted, since
  leaving bios or group names in Zawgyi would keep them unreadable.
  Hashtags and mentions were added because Burmese ones didn't work at
  all.
- **Found at close:** `day16-language` was flaky (2 of 5 runs). The test
  reloaded the page right after picking Myanmar, before the translations
  had downloaded and the choice was saved. In the app the next screen is
  an in-app link, so the choice is kept. The test now waits for the
  switch.
- **Performance:** converting costs ~0.3 ms per line of real Zawgyi,
  and Unicode text is ~free. Text longer than 10,000 characters is
  never converted. People search ORs two trigram matches; perf 38/38.
- **Tests at close:**
  - backend 702/702; Vitest 122/122; 54 mutations caught across the
    new tests.
  - Full browser run: all 51 suites (new: day43-zawgyi) + A3 EN/MY/AR
    (228 page checks each) green.
- **LATER.md:** #8, run `convert:zawgyi` on production after the next
  GO LIVE (GO_LIVE_CHECKLIST step 5).

### 2026-10-07 — Day 44: Polls
- **Model:** like X/Facebook/LinkedIn. The post's text is the question;
  2–4 options of 1–50 characters (stored as Unicode, Day 43); 1 day,
  3 days or a week. Polls work in groups and on pages. A poll post has
  no photos, like X.
- **Backend (`99ba020`):**
  - Migration 050: `polls`, `poll_options`, `poll_votes`. The primary
    key is one vote per person per poll. Everything goes with its post,
    and votes with their account.
  - The post, poll and options are inserted in one statement.
  - Every post list (9 queries) and `GET /posts/:id` carry the viewer's
    poll.
  - **Better approach than the plan:** results are anonymous, and
    per-option counts are sent only to voters, the author, or anyone
    once the poll has ended (X does this so counts can't sway a vote).
    Nobody, the author included, can see who voted.
  - `POST /posts/:id/poll/vote` uses the post's visibility rules (404).
    Repeating your vote is harmless (200). Changing it, or voting after
    the end, is refused (409). The open-poll check is inside the insert.
  - The data download has your polls and votes.
- **UI (`1fab603`):**
  - The composer's poll builder swaps out the photo picker. Empty or
    repeated options are explained before sending.
  - The post shows options, then results: bars with percentages, your
    vote ticked, the leader bold.
  - The footer reads "N votes · 3 days left" (rounded, so a new 3-day
    poll doesn't say 2, and it updates each minute) or "Final results".
  - A 409 (already voted elsewhere, or just ended) shows where the poll
    stands. Logged out, an option leads to login.
  - The bars use logical CSS and fill from the right in Arabic (proven
    on a 50% bar).
  - EN/MY/AR with every Arabic plural form. The Privacy Policy now
    covers polls and anonymous votes.
- **Not done, on purpose:** a "poll ended" notification. The only
  scheduler is a daily cron, so it would arrive up to a day late. Day 45
  (scheduled posts) needs a frequent scheduler, and it can ride on that.
- **Noted:** Explore lists posts with likes or comments, so a vote
  doesn't make a post "popular". Left as is.
- **Tests at close:**
  - backend 714/714 (polls.test 12, 31 mutations caught); Vitest
    134/134 (PollView 7, CreatePost 5, 19 mutations); rehearsal 015 →
    050; perf 38/38; bundle 218.3 kB.
  - Full browser run: all 52 suites (new: day44-polls, with axe on the
    poll) + A3 EN/MY/AR (228 each) green.

### 2026-10-07 — Owner decision: UI languages are English and Arabic only
- **What changed:** Myanmar is no longer a UI language, everywhere:
  - The switcher (Settings and landing page) offers English and العربية.
    `my.json`, the Myanmar date formatting, the Myanmar push texts and
    server-message table, the `@fontsource/noto-sans-myanmar` font and
    the `:lang(my)` CSS are gone. Browsers set to Burmese now get English.
  - Accounts that had chosen Myanmar move to English (migration 051,
    which also limits `users.language` to en/ar). A device that had
    Myanmar saved opens in English and saves that. An old logged-out
    Myanmar pick is dropped, not pushed to the account as a "choice".
    An unknown code (e.g. a stale account) means English.
  - Content is untouched: people can still post, comment, message and
    search in any language. Burmese hashtags, mentions, search and the
    server's Zawgyi→Unicode cleanup stay, because they handle what people
    write, not the app's own text. Burmese now shows in the device's own
    font.
- **Full EN/AR audit (owner item 4), and what it fixed:**
  - Server messages: 129 backend texts had no Arabic (only messages that
    existed in the Myanmar table had been translated). Every message a
    person or an admin can hit now has one. `check:i18n` scans the
    backend (`res.status().send`, `{ error }` results, thrown
    `XxxError(status, '…')`) and fails on a missing one. Developer-only
    validation is exempt by rule: lowercase field names, camelCase API
    fields, run-time lists.
  - Emails were English-only. Verification and reset emails now follow
    the account's language (`config/emailText.js`, EN/AR). The Privacy
    Policy says so (EN/AR).
  - Arabic relative times read "منذ 3 يوم". Years, months, weeks and days
    now use real plural forms ("منذ يومين", "منذ 3 أيام", "منذ 11 شهرًا").
  - `nav.shorts` was still English in Arabic. `check:i18n` now fails on
    any Arabic string that is just the English one, and on any locale
    other than en/ar.
  - Arabic letters join up, so headings and labels no longer get
    letter-spacing in Arabic.
  - The landing page said "Made for Myanmar" and "in English or Myanmar".
    It is rewritten for EN/AR, with neutral sample posts.
  - JSX scan: no hard-coded UI text. The PWA manifest and the page's meta
    description stay English: they are static files for installers and
    search engines, not per-person.
- **Docs:** standing rule 14; Day 16 and Day 43 updated (Day 43 is out of
  the plan); Day 49/58 now EN/AR; CLAUDE.md, the guide, ROADMAP (decision
  notes, NEEDS OWNER: Arabic review now covers emails and push), LATER
  #8 (still applies: it is about content), GO_LIVE_CHECKLIST (migrations
  015 → 051, EN/AR smoke test).
- **Tests:**
  - Backend: 717/717 tests in 67 suites, including the 051 migration on a
    Myanmar account and Arabic/English email and push. Vitest: 141/141
    in 28 files (new i18n.test, formatRelativeTime.test), with mutation
    checks. check:i18n: 980 keys each, 22 plural keys. Bundle: 216.7 kB.
  - Rehearsal 015 → 051 passed (up, down, data, smoke).
  - Browser: all 52 suites green, plus A3 EN and AR (228 page checks each)
    and day26-a11y (90 page checks). b15-lang, day16-language, c2-legal,
    c3-landing, day44-polls and the loop suites now run EN/AR. Where a
    Myanmar pass was the only dark/390px one, it became an English one.
- **Parked:** Day 45 (drafts) was mid-step in `git stash`. It resumes
  next, and its migration becomes 052.

### 2026-10-08 — Day 45: Drafts + scheduled posts
- **Better approach than the plan's** "runs via the existing cron job":
  that job is daily (a GitHub Action), so a post set for 3:15 pm could go
  up a day late. A 30 s ticker runs inside the server instead
  (services/ticker.js), plus once at start-up, which catches posts that
  fell due while the free-tier server slept. The keep-alive ping keeps
  it awake. The daily cleanup runs the same jobs as a backstop.
- **Data:** drafts and scheduled posts live in their own table
  (migration 052, post_drafts) and become real posts only when
  published. No post listing needed a "not published yet" filter, so
  there is no risk of one leaking through any of the 9+ post queries.
- **Step 1, drafts API (`e342375`):**
  - POST /posts and publishing a draft share one service
    (postCreationService), so a draft is checked as a post at the moment
    it goes up (still in the group? still the page owner?).
  - /drafts: create, list, get, edit (keepMedia keeps the chosen photos
    in order, adds new ones and deletes the rest), delete, publish (one
    transaction with a row lock: never twice). Up to 50 per person.
  - Draft photos are used media for the orphan scan, and are deleted
    with the draft, the account, the group or the page.
  - Drafts are in the data download and the Privacy Policy (EN/AR).
  - Review fix: a group or page id of 0 was taken as "none" and then
    hit the foreign key. It is now refused (403).
- **Step 2, scheduling (`5e7bee1`):**
  - scheduledFor runs from 5 min to 30 days ahead, and a scheduled post
    must be publishable now, so mistakes show at once.
  - The publisher takes one row per transaction with FOR UPDATE SKIP
    LOCKED, 25 per run.
  - If it can't go up (left the group; banned, suspended or deactivated
    account), it goes back to the drafts with the reason. An unexpected
    error leaves it due, to be tried again.
  - System notifications about your own post: scheduled_post and
    scheduled_failed (push and in the app, EN/AR).
  - check:i18n now also reads double-quoted server messages: 7 older
    ones had no Arabic and now do.
- **Step 3, UI (`99510bf`):**
  - Composer: "Save draft" and "Schedule for later" (your own time
    zone, shown with the picker); opening a draft brings its photos,
    group or page, poll and time.
  - /drafts: Drafts and Scheduled tabs (post now, edit, change time,
    move back to drafts, delete with a confirm, the failure reason) and
    a Menu row.
  - Also found: the composer's and Edit Profile's native file pickers
    showed "Choose Files / No file chosen" in the browser's language.
    Both are now translated buttons. The date picker's native
    min/max/required checks were dropped for the same reason: the range
    is explained in the app's language instead.
- **Step 4, "poll ended" (`686756f`):**
  - Migration 053: polls that had already ended count as notified, so a
    deploy sends no burst about old polls.
  - The author is told (poll_ended_own), and so is every voter who can
    still see the post (poll_ended). The getVisiblePost rules are
    written as one SQL insert, and each rule is pinned by a mutation
    test.
- **Not done / known:** the native date-time picker shows the date in
  the browser's own format (a page can't change it). Notification rows
  still aren't links (the app never had that; a later polish day).
- **Tests at close:**
  - backend 756/756 (drafts 16, scheduledPosts 12, pollEnd 10; mutation
    checks on locks, account checks, visibility rules); Vitest 161/161;
    check:i18n 1032 keys; bundle 217.8 kB; rehearsal 015 → 053.
  - Full browser run: all 53 suites (new: day45-drafts, including the
    live ticker publishing and poll-ended notifications) + the 5
    special-stack suites + perf 38/38 + A3 EN/AR (234 each, /drafts
    added) + a11y (95 page checks, /drafts in EN and AR).
  - day34-group-photo had a race in one check (it read the page before
    her own update arrived). It now waits (`1ba1610`; that commit's
    message also announced these docs, which follow here).

### 2026-10-08 — Day 46: Saved collections
- **Model:** Instagram's. "Saved" is every saved post; collections are
  named groups of them, and a post can be in several. Saving into a
  collection also saves the post. Unsaving takes it out of every
  collection; deleting a collection keeps its posts saved. A collection
  item points at the bookmark (migration 054), so the database
  enforces all of that through cascades.
- **API (`b424bf0`):**
  - /collections: list (count and cover from the posts you can still
    see), create, rename and delete; paged /collections/:id/posts.
  - /posts/:id/collections: get the ids, or set them (one transaction;
    saves first). Names up to 50 characters, unique per person whatever
    the case; 30 collections at most. Anyone else's collection answers
    404.
  - GET /bookmarks and a collection's posts now share one query
    (services/savedPostsService), so both apply the same visibility
    rules (blocks, private accounts, groups left, "only me",
    deactivated authors).
  - Also: the data download, the Privacy Policy (EN/AR, dated
    2026-10-08), Arabic server messages, and convert-zawgyi COLUMNS
    (plus post_drafts.content, which Day 45 missed).
- **UI (`a2a2e56`):**
  - "Save to collection" in every post's ⋯ menu: a sheet with
    checkboxes and "New collection" right there. It is loaded only when
    first opened, to keep the feed's first download small.
  - Saved shows a collections row (cover, name, count, "New
    collection") above all saved posts.
  - /saved/collections/:id has rename, delete (asks first), and empty
    and "doesn't exist" states.
- **Arabic:** a collection is "قائمة" (list), because "مجموعة" already
  means a group in this app. In RTL, an English collection name sits
  next to its checkbox (`<bdi>`, sized to its text) instead of drifting
  to the far edge. The sheet got side padding, which ActionSheet's
  full-width rows never needed.
- **Not added:** the perf suite. It seeds ~200 bookmarks, far under its
  4 MB table threshold, and the collection queries use the same filters
  plus primary-key lookups. Adding them would cost ~22 s on a suite
  near its 10-minute limit.
- **Tests at close:**
  - backend 765/765 (collections 9, with 6 mutation checks on
    ownership, visibility and counts); Vitest 170/170; check:i18n 1059
    keys; bundle 218.5 kB; rehearsal 015 → 054.
  - Full browser run: all 54 suites (new: day46-collections) + the 5
    special-stack suites + perf 38/38 + A3 EN/AR (240 each, a seeded
    collection added) + a11y (97 page checks).

### 2026-10-09 — Day 47: Privacy controls
Four steps, one feature each. The other person is never told about any
of them.
- **Mute (`a88f9a7`, migration 055):** Facebook's snooze / Instagram's
  mute.
  - Their posts and stories leave your Home, stories tray and Explore.
    Profile, search, links, groups, comments and notifications are
    unchanged. Their page's posts stay (the page isn't the person).
  - Where: their posts' menu (the posts leave the feed at once), their
    profile (with a note), and Settings > Muted accounts.
  - Found: names in the Blocked list sat centred (the app centres text
    at the root). Fixed for both lists.
- **Restrict (`de2268d`, migration 056):** Instagram's Restrict.
  - Their new comments on your posts are held: seen only by them and
    you, marked for you, counted only for you two, so the count gives
    nothing away. You can approve or delete them.
  - A held comment notifies nobody: not you, not the person it replies
    to, not @mentions.
  - No notifications or pushes from them anywhere: one rule in notify(),
    mentions and message pushes.
  - The UI had no way to delete a comment at all. Added for the
    comment's author and the post's owner.
  - VERIFY caught a bug of mine: a bulk edit had turned
    postService.authHeaders into a function calling itself, which
    crashed the feed. Unit tests missed it; the browser suite caught it.
- **Close friends (`7c18d35`, migration 057):**
  - A list (people who follow you; searchable candidates). A "Close
    friends" audience for posts (composer, post menu, green star) and
    stories ("Share to" after picking the photo, green ring).
  - postVisibilityService.postAudienceSql now holds the audience rule
    that was copied into seven listing queries. getVisiblePost, the
    feed, notification snippets, poll-ended voters and the stories tray
    apply the same rule.
  - Rolling back makes close-friends posts "only me" and deletes
    close-friends stories: never more visible.
- **Who can message / comment (`3683d09`, migration 058):** Settings >
  Messages and comments.
  - Messages: everyone / people I follow / no one new. An ongoing chat
    goes on and group chats are exempt. Checked when a chat starts and
    on every direct send (all kinds, HTTP and live).
  - Comments: everyone / my followers / people I follow; group and page
    posts exempt.
  - The profile's Message button is off with the reason (can_message).
    Its errors used to be swallowed silently.
- **Arabic:** muted = مكتوم, restricted = مقيّد, close friends = الأصدقاء
  المقرّبون. New text checked in RTL screenshots (lists, held comment,
  settings, green ring).
- **Tests at close:**
  - backend 790/790 (mutes 6, restrict 7, closeFriends 7, interactions
    4; 40 mutation checks across the four, all caught); Vitest 188/188;
    check:i18n 1131 keys; bundle 220.9 kB; rehearsal 015 → 058.
  - Full browser run: all 55 suites (new: day47-privacy, 48 checks) +
    the 5 special-stack suites + perf 38/38 + A3 EN/AR (264 each) +
    a11y (105 page checks).

### 2026-10-09 — Day 48: Activity log
Facebook's Activity log, two steps. Only you can see it.
- **API (`b155595`, migration 059):** GET /activity/likes (reactions on
  posts and likes on comments, one list newest first, each branch
  limited before merging) and GET /activity/comments, paged. Only posts
  you can still see (the saved-posts visibility rule). The user indexes
  on likes / comment_likes / comments became (user_id, created_at DESC).
- **UI (`cc6384b`):** Settings > Your activity (/activity), tabs Likes /
  Comments / Searches with arrow keys. Each row links to the post and
  can be removed with the existing endpoints: remove reaction, unlike a
  comment, delete a comment (asks first), remove a search or clear all
  (asks first). Load more, empty states, EN/AR, RTL.
- **Process note:** the API commit went in the same batch as the perf
  run that should have gated it; perf was re-run alone straight after
  (40/40). Rule kept in WIP: never batch a commit with its checks.
- **Tests at close:**
  - backend 795/795 (activity 5, 5 mutation checks caught); Vitest
    193/193; check:i18n 1158 keys; bundle 221.2 kB; rehearsal 015 → 059.
  - Full browser run: all 50 regular suites (new: day48-activity, 12 checks) +
    the 5 special-stack suites + perf 40/40 (/activity/likes 44 ms,
    /activity/comments 177 ms) + A3 EN/AR (270 each) + a11y (111 page
    checks). The first full run was stopped by the machine running low
    on memory; it was re-run in batches of five suites, all green.

### 2026-10-10 — Day 49: Content filtering
Three steps. The plan said "bad-word list with hide-or-warn"; built as
Instagram's Hidden words, a filter each person sets for what *they* see,
so nobody is stopped from writing anything (standing rule 14).
- **Hidden words API (`ec5c356`, migration 060):** each account has a
  mode (warn, the default / hide / off) and up to 100 words of its own,
  in any language. Private, in the data export and the Privacy Policy.
- **Hidden words UI (`2c05daa`):** Settings > Hidden words.
  - A built-in English / Arabic list plus your words. One matcher reads
    a$$, sh1t, stretched letters (fuuuck, شرموووطة), Arabic letter forms,
    diacritics, tatweel and و / ف / ال prefixes. Whole words and phrases
    only ("class" never matches "ass"). Scripts written without spaces
    (CJK, Thai, Burmese) match inside the text.
  - Warn: someone else's matching post keeps its header; its text, poll,
    photos and link card are covered with "Show anyway". A comment's
    text is covered the same way. Hide: they're left out (a post opened
    from a link is covered instead). Never your own.
  - Why the client matches: one matcher instead of a filter in every
    listing query, and it is a viewing preference, not security. The
    list and matcher load only when the filter is on, outside the first
    download.
- **Spam checks (`22c8847`):** a new post or comment is refused (429,
  with the reason in EN/AR) for flooding (over 10 posts or 30 comments
  in 10 minutes), the same text again (a post within 10 minutes, a
  comment on the same post), or the same link in 3 of your posts and
  comments in the last hour. Counted from the database. Scheduled and
  draft posts the ticker publishes, and edits, aren't checked. Off in
  the test suites unless SPAM_CHECKS_IN_TESTS=1 (SPAM_SUITES in
  run-all.sh).
- **Found on the way:** form error text (#e11d48) was 4.4:1 on the page
  background, below WCAG AA. It now has its own token
  (--color-error-text), about 6:1 in both themes, for all 37 form errors.
- **Tests at close:**
  - backend 807/807 (hiddenWords 5, spam 7; 24 mutation checks, all
    caught); Vitest 214/214; check:i18n 1185 keys; rehearsal 015 → 060.
  - Bundle 223.5 kB of the 225 kB budget (+2.3 kB this Day). The next
    feature that adds to the first download must lazy-load or trim.
  - Full browser run in batches of five: all 51 regular suites (new:
    day49-hidden-words, 22 checks) + the 6 special-stack suites (new:
    day49-spam, 9) + perf 40/40 + A3 EN/AR (276 each) + a11y (113 page
    checks).

### 2026-10-11 — Day 50–52: Groups (basic)
B13 had already built creating groups, public/private, joining (instant
or by request), approve/deny, leaving, group posts, admins and
promote/demote, removing members and admins deleting any post. Verified,
then the gaps for "group moderation", Facebook-style, one slice each:
- **Remove and ban (`db33c11`, migration 061):** Remove asks first, with
  "Also ban them": they can't join or ask again until unbanned. There's
  a Banned list with Unban.
  - Only members comment on and react to a group's posts. Before, anyone
    could on a public group, so a ban would have changed nothing.
  - Non-members see posts and comments read-only, on the group page and
    (`5e9b803`) on a post's own page.
  - The group page now says why Join failed; the error used to be
    swallowed.
- **Delete a group (`ac80315`):** any admin; type the name to confirm, as
  for a page. Its posts and photos go too. A deleted group's page no
  longer offers a useless Try again.
- **Paging (`80d4dee`):** members, join requests, bans and the groups
  list load 20 at a time.
  - Found: "Your groups" was split out of one site-wide top 100, so
    with enough groups your own could disappear. Now it's two queries,
    with a regression test using 120 groups.
- **Notifications (`9d883b7`, migration 062):** "X asked to join G" to
  the admins, "You're now a member of G" to the person let in. Push
  text is EN/AR, and each notification links to the place to act.
  - There's a Groups switch in notification settings.
  - A handled request's notifications are removed.
- **Bundle (`01b362c`):** the Arabic server-message table moved out of
  every visitor's first download, which had reached 224.0 of 225 kB.
  It's now 218.2 kB.
- **Not done / honest notes:**
  - The guard against two simultaneous join requests notifying twice
    can't be raced in the test database; it stays as a defensive guard.
  - The perf suite doesn't seed groups, so the groups list queries
    aren't timed. "Discover" counts members per group, which is fine
    at today's size.
  - GET /pages has the same top-N-then-split shape as the old groups
    list; it's for the Pages days.
- **Tests at close:**
  - backend 826/826 (communityModeration 17; 41 mutation checks, all
    caught but the one above); Vitest 231/231; check:i18n 1209 keys;
    rehearsal 015 → 062.
  - Full browser run in batches of five: all 51 regular suites (new:
    day50-group-bans, 28 checks) + the 6 special-stack suites + perf
    40/40 + A3 EN/AR (276 each) + a11y (113 page checks).

### 2026-10-11 — Day 53–54: Pages (basic)
B14 had built creating, editing and deleting pages, following, and
posting as a page (owner only), with page posts in followers' feeds.
Verified, then the gaps, one slice each:
- **Page admins (`1b5e718`, migration 063):** Facebook's Page roles,
  simplified to an owner and up to 20 admins.
  - The owner adds admins by username in Edit page > Admins and removes
    them; an admin can leave.
  - Admins edit the page, post as it, and edit or delete its posts. Only
    the owner deletes the page or changes admins.
  - Not addable: the owner, deactivated accounts, anyone across a block.
  - Better than "the person who typed it": page posts stay under the
    OWNER as posts.user_id. B14's blocks, visibility and
    account-deletion rules all rest on that. If an admin's own account
    held the post, deleting that account would delete page posts.
    Drafts and scheduled posts check that their author is still an
    admin when they go up.
- **Pages list (`1e90c23`):** like groups on Day 50, the list was split
  out of one site-wide top 100, so your own page could disappear. It's
  now three paged queries: pages you run (owner or admin), pages you
  follow (latest first) and the rest (most followed first). There's no
  Follow button on pages you run.
- **Notification (`c3ffc10`, migration 064):** "X made you an admin of
  P" on screen and by push (EN/AR), opening the page, with a Pages
  switch in notification settings. It's removed again if they're
  removed or leave.
- **Not done:** Facebook shows admins which admin wrote a page post. We
  don't record that (page posts belong to the page); it can come later
  with a posts.created_by column.
- **Tests at close:**
  - backend 839/839 (pageAdmins 12; 30 mutation checks, all caught);
    Vitest 238/238; check:i18n 1234 keys; bundle 218.5 kB; rehearsal
    015 → 064.
  - Full browser run in batches of five: all 52 regular suites (new:
    day53-page-admins, 14 checks) + the 6 special-stack suites + perf
    40/40 + A3 EN/AR (276 each) + a11y (113 page checks).

### 2026-10-12 — Day 55–56: Events (basic)
New: nothing existed. Facebook Events, basic, in three slices:
- **API (`f690a05`, migration 065):** events (host, name, time with an
  optional end, place, details, public or followers-only) and Going /
  Interested answers.
  - Seen the way posts are: blocks either way, a deactivated host, and
    "followers" meaning accepted followers.
  - The host edits, cancels (it stays, marked) or deletes. Nobody
    answers a cancelled or finished event.
  - Lists: your events (hosting or answered) and Discover, upcoming
    soonest first, paged; guest lists paged.
  - The data export and the Privacy Policy include events.
- **UI (`ea48e34`):** Menu > Events with Your events and Discover tabs.
  - Create and edit: local date-time pickers, with the time zone shown.
  - The event page: a calendar badge, when, host and counts, place,
    details, Going / Interested toggles, guest tabs, and the host's Edit,
    Cancel and Delete (asking first).
  - The composer's date helpers moved to utils/localTime.js, now shared.
  - axe found that badge text on the pale badges was 3–4:1 (the same
    colours are used app-wide). There are new --badge-*-text tokens at
    6:1+.
- **Reminders and notifications (`d6ea3b5`, migration 066):** the
  server's 30 s ticker reminds everyone going or interested about an
  hour before. It skips a late reminder if the server slept past the
  start, and the daily cleanup is a backstop.
  - The host cancelling tells them.
  - Each person's settings apply (a new Events switch), and so do blocks
    and the audience.
  - Push in EN/AR; the in-app reminder shows the start in the viewer's
    own time zone.
- **Process notes, honestly:**
  - `ea48e34` was committed in the same command as a backend run with
    one failure. That was a flaky TEST (it looked for "123" in a log
    line holding a random id and timestamps). It's fixed in `23c35ab`,
    and every commit is now gated on its checks.
  - One backend run couldn't start the test database while it replayed
    its log after a crash; the re-run was clean.
- **Not done:** an event photo (Cloudinary; can follow the profile cover
  pattern), "invite friends", and events in search. The perf suite
  doesn't time the events lists yet.
- **Tests at close:**
  - backend 856/856 (events 16; 33 mutation checks, all caught); Vitest
    248/248; check:i18n 1298 keys; bundle 219.5 kB; rehearsal 015 → 066.
  - Full browser run in batches of five: all 53 regular suites (new:
    day55-events, 20 checks, including a reminder from the real ticker)
    + the 6 special-stack suites + perf 40/40 + A3 EN/AR (288 each) +
    a11y (117 page checks).

### 2026-10-12 — Day 57: Storage safety
Before: a 5 MB cap per file, media deleted with its content, and an
orphan scan. Nothing measured usage, compressed photos, limited a
person, or warned anyone. Three slices, with no new accounts:
- **Compression in the browser (`c699a45`):** photos over 2048 px or
  1 MB are redrawn and re-encoded (WebP, else JPEG, quality 0.85)
  wherever one is picked: posts, stories, chats, group photos, covers
  and avatars.
  - GIFs are left alone, and the original is kept if it isn't smaller.
  - In real Edge an 8.2 MB photo went up as 2.5 MB.
  - Found on the way: Post could be tapped while photos were still
    being prepared, sending the post without them. It now waits, with
    "Preparing your photo…".
- **Upload limit per person (`8d1ab62`, migration 067):** 100 files or
  300 MB per 24 hours by default (UPLOAD_LIMIT_FILES_PER_DAY,
  UPLOAD_LIMIT_MB_PER_DAY).
  - It's checked before anything goes to Cloudinary, from a 30-day
    upload ledger.
  - Over the limit, the composer says why (EN/AR). The data export and
    the Privacy Policy include the ledger.
- **Admin > Storage (`ecd8af6`):** the database measured by Postgres
  against the Neon plan (NEON_STORAGE_LIMIT_MB, default 512 MB), with
  its biggest tables.
  - Cloudinary credits, storage and bandwidth come from its Admin API
    with the existing keys, cached for 10 minutes; it shows "not set up"
    without them.
  - It lists uploads in the last 24 hours and the top uploaders, with a
    warning at 80 % and an alert at 95 %.
- **Found in the close-out run:** Manage group showed a new "Members
  (n)" a moment before its request list caught up (from Day 50); fixed
  in `25e68f3`. day44-polls and b2-media now wait for a picked photo's
  thumbnail.
- **Tests at close:**
  - backend 868/868 (uploadQuota 6, storage 6; 31 mutation checks, all
    caught); Vitest 258/258; check:i18n 1323 keys; bundle 220.5 kB;
    rehearsal 015 → 067.
  - Full browser run in batches of five: all 54 regular suites (new:
    day57-storage, 8 checks) + the 6 special-stack suites + perf 40/40 +
    A3 EN/AR (288 each) + a11y (117 page checks).

### 2026-10-13 — Day 58: Accessibility + translations check
check-i18n already proved every key exists in English and Arabic. Two
new scans, now part of `npm run check:i18n` (so CI fails on them), plus
a suite for the open overlays:
- **UI text that skips t() (`53246e8`):** scripts/check-hardcoded-text.cjs
  parses every .jsx and flags JSX text, text attributes (aria-label,
  placeholder, title, alt…) and our components' text props, plus
  setError('…')-style setters given words.
  - Text that isn't UI (the bot honeypot, a sample username) is marked
    `data-i18n="skip"`.
  - The app passes; fixture tests prove the scan catches each kind.
- **CSS that breaks right-to-left (`dad6cca`):** scripts/check-rtl-css.cjs
  flags physical left/right margins, padding, borders, positions,
  corner radii, text-align and float, and translateX motion. It allows
  [dir] override rules and lines marked `rtl-ok`.
  - Fixed: the admin error list aligned its text left in Arabic.
- **Open states (`75e0a19`):** found that Modal (every dialog and sheet)
  let Tab wander to the page behind, and lost keyboard focus on close.
  - It now keeps Tab and Shift+Tab inside, and gives focus back to the
    button that opened it.
  - New suite day58-open-states, 50 checks: the post menu, Report, Save
    to collection, the Delete confirm and the reaction picker, in EN
    light 390 and AR dark 375.
  - Each gets axe, and the suite checks that Escape closes, focus
    returns and Tab stays inside. 14 of the checks fail on the old Modal.
- **Memory:** a3 was stopped once for low system memory (not a test
  failure). The Work rhythm now says: small batches, test stack down
  between batches, never two heavy jobs at once.
- **Tests at close:**
  - backend 868/868; Vitest 264/264 (+6: both scans, the Modal Tab trap
    and focus return); check:i18n 1323 keys, no hardcoded text, logical
    CSS everywhere; bundle 220.8 kB.
  - Full browser run in small batches: all 55 regular suites (new:
    day58-open-states) + the 6 special-stack suites + perf 40/40 +
    A3 EN/AR (288 each) + a11y (117 page checks).

### 2026-10-13 — Day 59: Re-audit (AUDIT_REPORT_3.md)
Read-only; no application code changed. Same method as audit 2, on
`ca8d531` (the verified Day 58 close).
- **Audit 2's findings:** N1 to N4 are fixed. N5 (frontend console
  calls) and N6 (token in localStorage) are informational and unchanged.
- **Routes:** 189, classified by a script: 142 need a login, 9 are
  admin-only, 24 are optional-auth reads, 1 needs a secret, and 13 are
  public. The public set is the same 13 as audit 2.
- **Probes, 41/41:** aimed at leaks between features added on Days
  30–58: close-friends posts, a pinned only-me post, a saved post that
  later becomes only-me, polls, forwarding and reacting outside a chat,
  blocks against events, page admins and close friends, group bans,
  comment and message permissions, restrict, and owner-only edits. 4 of
  them are live Socket.io probes (a removed member's open socket, a
  forged send, someone else's chat).
- **New findings:**
  - A1, Medium: `npm audit` reports proxy-addr (critical) and
    source-map-js (high) in the backend. Neither is reachable as
    configured (`trust proxy` is a hop count), and CI doesn't run
    `npm audit`.
  - A2, Low: 7 Settings rows are still "Coming soon".
  - A3, Info: the longest browser suites are slow on the owner's machine.
- **Next:** both fixes are planned for Day 60's owner-free part.
- **Tests:** unchanged since the Day 58 close the same day (backend
  868/868, Vitest 264/264, full browser run green).

### 2026-10-13 — Day 60: GO LIVE skipped (owner); AUDIT_REPORT_3 A1 and A2 fixed
GO LIVE needs production access, so it stays the owner's (LATER.md #2;
the rehearsal covers 015 → 067). The owner-free part:
- **A1, dependency advisories (`96697f6`):** proxy-addr 2.0.8 and
  source-map-js 1.2.2 (lockfile only).
  - New CI job "Dependency audit": `npm audit --omit=dev
    --audit-level=high` in backend, frontend and e2e. A CI test keeps it
    there (2 mutations caught).
  - Left: 19 moderate advisories in backend dev tooling (sprintf-js via
    jest). The fix needs a breaking `--force` upgrade, and none of it runs
    in production.
  - Lesson: `npm audit fix --omit=dev` strips dev dependencies from
    node_modules; run `npm install` after it.
- **A2, Settings (`4f743db`):**
  - Followers & Following opens your own connections.
  - New public pages, in English and Arabic: /help (eight short answers)
    and /about.
  - Removed: Who Can See My Content, Content Preferences, News Feed
    Settings and Story Settings. Nothing was planned for them, and the
    Private Account switch, each post's audience, close friends, muted
    accounts and hidden words already cover them.
  - Reels and Live stay disabled (paused features).
  - check-i18n now accepts `t(key, { returnObjects: true })` for a key
    that holds a list.
  - New suite day60-settings (29 checks). /help and /about joined the
    a11y and route-guard suites.
- **Tests at close:**
  - backend 869/869; Vitest 270/270; check:i18n 1346 keys; bundle
    221.5 kB.
  - Full browser run in batches of four, with the stack down between
    batches: all 58 regular suites + the 6 special-stack suites + perf
    40/40 + A3 EN/AR (288 each) + a11y (121 page checks).

### 2026-10-13 — Day 61–62: Admin dashboard (Admin > Overview)
Built on the existing admin screen (Reports, Errors, Storage), with no
outside analytics and no chart library.
- **API (`4d10768`, migration 068):** `GET /admin/overview?days=7|30|90`,
  admins only.
  - One point per day: signups, posts, comments and reports.
  - Totals: users, posts and comments, plus groups, pages, waiting
    reports and unresolved errors.
  - Storage levels: the database, and Cloudinary (cached).
  - Finished UTC days are counted once into `daily_stats`, by the ticker
    or when the page is opened (the first time, 90 days back). Today is
    counted live. Big tables' totals use Postgres' own estimate.
  - Two servers rolling up at once keep each other's days (a test
    proves it with an uncommitted row).
  - At the perf seed (about 1M rows) the overview takes 160 ms and reads
    2 rows of the big tables.
  - GO_LIVE_CHECKLIST: 015 → 068 (27 tables, 23 columns, 14 indexes).
    The rehearsal passed, with 137 indexes matching.
- **UI (`ceb414d`):** the admin screen opens on Overview.
  - Total cards (≈ for estimates).
  - Shortcuts to waiting reports, unresolved errors and storage.
  - A 7 / 30 / 90-day switch, and four SVG bar charts: newest on the
    left in Arabic, today paler. The same numbers are in a table.
  - English and Arabic, with full Arabic plurals.
  - The open section is in the URL (`/admin?section=reports`), so Back
    works. The suites that open Reports use that URL.
- **Decision (logged):** days are UTC, said under the charts. Per-viewer
  time zones would need hourly counts; that's not worth it for a few
  admins.
- **Tests at close:**
  - backend 877/877 (adminOverview 8; 5 mutations caught); Vitest
    275/275 (overview panel 5); check:i18n 1373 keys; bundle 221.7 kB.
  - Full browser run in small batches, with the stack down between them:
    all 59 regular suites (new: day61-overview, 23 checks) + the 6
    special-stack suites + perf 41/41 + A3 EN/AR (288 each) + a11y (123
    page checks).

### 2026-10-13 — Day 63: Admin audit log
- **Backend (`b5d53cb`, migration 069 `admin_actions`):** every
  moderation decision is written to the log in the same transaction as
  the decision itself: dismissing a report, removing content, banning,
  suspending, unbanning, and resolving an error.
  - Photos and voice notes are deleted only after that transaction
    commits.
  - The log names the admin (their name is kept even if their account
    goes), the account, group or page concerned (or the error's message),
    the reason and the number of reports closed. It never keeps the
    removed content.
  - `GET /admin/log`: newest first, 30 a page, filterable by kind.
  - The daily cleanup keeps it for 2 years. The Privacy Policy (sections
    3 and 7, EN/AR) says so, updated 2026-10-13.
  - GO_LIVE_CHECKLIST: 015 → 069 (28 tables, 23 columns, 15 indexes).
    The rehearsal passed, with 139 indexes matching.
- **UI (`7baf28d`):** Admin > Log, a fifth section.
  - Each decision reads as a sentence ("alice removed a post by carol",
    "alice suspended carol for 3 days"), with the time, the reason and
    the reports closed.
  - Filter by kind, and "Show older".
  - English and Arabic, with Arabic plurals. Names keep their own
    direction inside the other script (Unicode isolates).
  - The admin tabs now wrap to a second row on phones instead of
    squeezing a label onto two lines.
- **Tests at close:**
  - backend 885/885 (adminLog 8; a mutation that drops the transaction
    is caught); Vitest 278/278; check:i18n 1403 keys.
  - bundle 222.2 kB: 2.8 kB of headroom left, mostly taken by en.json
    growing. Worth a look in Day 74 (performance round 2).
  - Full browser run in small batches: all 60 regular suites (new:
    day63-log, 16 checks) + the 6 special-stack suites + perf 41/41 +
    A3 EN/AR (288 each) + a11y (125 page checks).

### 2026-10-19 — Days 64–66: End-to-end user journeys
The 15 most important user journeys, walked only through the UI: every
person has their own browser, signs up with the real forms and logs in.
The one exception is the admin, who is made with SQL, because the app has
no screen for that. Shared helpers are in `e2e/journey-kit.cjs`. The list
is in `e2e/JOURNEYS.md`.
- **journeys-core (`e454e84`, 20 checks):**
  - J1 landing page → sign up → first post on Home and on the profile;
  - J2 log out and in, and a reload keeps you in;
  - J3 search → follow → like and comment, and the person is notified;
  - J4 a private account's follow request, approved;
  - J5 a DM from a profile, live both ways.
  - **Bug it found, fixed:** a brand-new direct chat wasn't live until a
    reload. Sockets join their chats' rooms only when they connect.
    `syncRooms` moved from groupController to `sockets/index.js`, and
    creating a chat now calls it. Backend test
    `newConversationLive.test.js` (a mutation is caught).
- **journeys-social (`3a22ac8`, 17 checks):**
  - J6 a group chat, live for everyone;
  - J7 a photo post;
  - J8 a story, opened, then marked seen;
  - J9 a group found, joined and posted in;
  - J10 a page's post on a follower's Home, and an event with a Going.
  - **Better approach (rule 9):** photos are now *really* uploaded in a
    browser test for the first time. Before, every suite intercepted the
    request. `e2e/cloudinary-stub.cjs` answers the Cloudinary SDK's signed
    upload and serves the file. The SDK is pointed at it with its own
    `upload_prefix` setting (inside `CLOUDINARY_URL`), so no app code
    changed and no account is needed. The suite fails without the stub.
    New stack mode: `MEDIA_SUITES` / `E2E_MEDIA=1`.
- **journeys-safety (`76f4fbf`, 21 checks):**
  - J11 a report removed by an admin, also in the admin log;
  - J12 block and unblock;
  - J13 an Arabic bio reads right to left; the app in Arabic and back;
  - J14 a new password signs the other device out;
  - J15 delete account (password plus typed username).
  - Refused log-ins are expected only during that one attempt
    (`attemptLogIn {refusal}`), so there are no blanket allow-lists.
- **AUDIT_REPORT_3 A3 (`43f6396`):** day26-a11y now runs as three parts
  (~2 min each) and the A3 matrix as four (EN/AR × light/dark, ~4 min
  each). Each part gets its own fresh stack, and `E2E_ONLY` takes the
  whole suite or one part. The totals are the same, and a CI-workflow test
  keeps the parts equal to the whole.
- **CI (`3179c43`):** journeys-core runs on every push (smoke), and all
  three run in the full job. ciWorkflow.test checks that JOURNEYS.md lists
  J1..J15 and that each one has checks in the suite it names.
- **Decision (logged):** only journeys-core is in the every-push smoke
  job, because CI minutes are limited. The other two run on pull requests
  to master and by hand.
- **Follow-ups:**
  - Nothing tells you when an admin removes your content (FB/IG do). For
    Day 81–82 or the Day 85–87 buffer.
  - The e2e/README suite table stops at Day 5. For Day 69–71.
  - day27-perf now takes ~8.5 minutes, the longest suite. Split it in
    Day 74.
- **Tests at close:**
  - backend 905/905.
  - Full browser run in small batches, with the stack down between them:
    all 60 regular suites (new: journeys-core 20, journeys-safety 21),
    journeys-social 17 on the media stack, the 6 special-stack suites, and
    perf 41/41.
  - a11y (125 page checks: 59 + 59 + 7) and A3 EN/AR (288 each, in 4
    parts) ran green in step 4 on the same app code.

### 2026-10-19 — Days 67–68: API documentation
- **The spec (`56987ad` … `49ee052`):** `backend/docs/openapi` builds an
  OpenAPI 3.1 description of all 194 operations from area files. Each
  operation documents its auth, parameters, body, every status it answers
  with and the response schema. Small helpers keep the operations short
  and alike.
- **It can't drift:**
  - `openapiSpec.test.js` walks the real Express router: every route is
    documented and every documented operation exists. The auth must match
    the route's middleware, uploads must say multipart, path params must
    match, and every `$ref` must resolve.
- **Better approach (rule 9):** instead of a separate hand-picked contract
  test, `tests/helpers/contract.js` (installed by `setupTestApp`) checks
  *every* response the ~920 API tests see:
  - the status code is documented;
  - the content type is one documented for that status;
  - a JSON body matches its schema.
  - A mismatch fails the test file, and mutations are caught in every
    area.
  - A coverage report at the end lists the operations no test reached.
    The five it found got tests, so all 194 operations are checked.
- **What documenting found and fixed:**
  - Every plain-text answer (errors, confirmations) was sent as
    `text/html`, Express's default. They are `text/plain` now: correct,
    and never rendered as a page.
  - The spec had missed some real shapes: notification types
    `poll_ended`/`poll_ended_own`, the admin log's 64-bit ids (strings),
    and storage warnings as objects.
- **Docs page (`6563f96`):**
  - `GET /docs` is Swagger UI served from the package (5.33.1, no CDN);
    its script is a file, so the API's CSP stays `script-src 'self'`.
    `GET /openapi.json` serves the spec.
  - Both are on outside production; in production only with `API_DOCS=1`
    (.env.example, GO_LIVE_CHECKLIST).
  - Checked in Edge at 1280 and 375 px: no sideways scroll, 0 console
    errors.
  - `backend/docs/REALTIME.md` documents every Socket.IO event; a test
    keeps it equal to the code, both ways.
- **Decision (logged):** the docs are off in production by default. This
  is the app's own API, and every route is protected either way, so there
  is no need to publish its map.
- **API issues seen while documenting (for Days 69–71, code health):**
  - Unpaginated lists: `GET /users/:id/followers` and `/following` (the app
    uses `/connections`), `GET /posts/:id/comments`, `GET /conversations`.
  - `follow-counts` and `GET /posts/:id/likes` echo the id as a string.
- **Tests at close:**
  - backend 924/924, API operations reached 194/194; check:i18n.
  - Full browser run in small batches: all 60 regular suites, the 6
    special-stack suites, journeys-social 17, perf 41/41, a11y 125 (in 3
    parts) and A3 EN/AR (288 each, in 4 parts).

### 2026-10-19/20 — Days 69–71: Code health
The biggest file was 735 lines, so the real debt was duplication, and
lists that grow without limit.
- **One error type (`bca3169`):** `utils/httpError.js` has
  `HttpError(status, message)` and `sendError()`.
  - 15 error classes extend it, keeping their names and messages (the app
    translates the messages).
  - Removed: 4 local `handle()` helpers, 29 `instanceof` chains and 6
    re-throw wrappers.
  - Every handler now ends with `sendError`, and socket error codes are
    read from the same status.
  - The contract check proved no response changed. A guard test stops the
    old pattern coming back.
- **One block-check helper (`6a0f406`):** `noBlockBetweenSql(a, b)`
  replaces 24 copies of the same SQL. The query plans are unchanged
  (perf 41/41), and making the helper one-way fails 11 tests.
- **Lists that grew without limit, now paged:**
  - People (`3572404`): the unpaged followers/following endpoints were
    removed. `/connections` gained a username search, and the group-member
    picker pages and searches on the server.
  - Comments (`4021399`): 50 at a time, with "View more comments" (EN/AR).
    The cursor is the comment id, with index migration 070; the rehearsal
    passed with 140 indexes.
  - Inbox (`7bb2971`): 20 chats at a time, with Load more and `?q=` /
    `?id=`. A chat's header no longer downloads the whole inbox, and the
    forward sheet searches all chats.
- **Bug found and fixed (`0c2ebd2`):** scrolling back through a chat
  skipped messages sent in the same millisecond at a page edge. The cursor
  sent created_at through a JS Date, which keeps milliseconds while
  Postgres keeps microseconds. A test proved it: 2 of 5 messages never
  arrived. The cursor is now the id, and the database compares against the
  row's own stored values.
- **Split (`f1c50ab`):** `useConversationMessages` went from 735 to 494
  lines.
  - Its pure helpers moved to `utils/chatMessages.js`.
  - Voice and photo sends moved to `hooks/useMediaMessages.js`, where two
    near-copied upload flows became one. The hook's API is unchanged, and
    both new modules have tests.
- **Docs (`ab0a71d`):**
  - A root README: running locally, env var names, the API, tests,
    languages.
  - A real frontend README.
  - e2e/README lists every suite; a test keeps it that way.
  - CLAUDE.md's Completed Features and Next Steps are current; the owner's
    rules are untouched.
  - The VAPID keys are in .env.example.
  - Two output files committed by mistake on Day 47 are removed.
- **Better approach (rule 9):** every list was given its own cursor rather
  than a shared timestamp cursor. Ids (or a lookup of the row's own stored
  time) never lose precision.
- **To look at later:** in Arabic, the new-group screen's back button sits
  on the left. This is pre-existing; check the app's header convention.
- **Tests at close:**
  - backend 950/950, all 192 API operations reached by the tests; Vitest
    291/291; lint; check:i18n 1406 keys; bundle 222.6 kB.
  - The go-live rehearsal passed (56 migrations up and down, 140 indexes).
  - Full browser run in small batches: all 60 regular suites, the 6
    special-stack suites, journeys-social, perf 41/41, a11y 125 (3 parts)
    and A3 EN/AR (288 each, 4 parts).
  - day12-review read the old comment shape; it was fixed, and its check
    can no longer pass on an empty list.

### 2026-10-20 — Days 72–73: Offline + PWA polish
- **Offline banner and Home (`1f15498`):**
  - A "You're offline" strip shows on every screen (EN/AR, inverse colours
    for both themes).
  - Home keeps its newest 20 posts on the device, per account. Offline, it
    shows them ("from your last visit"). Back online it reloads by itself:
    at once, then after 2 and 6 seconds, and a failed try keeps the saved
    posts. The browser test showed that the first request after the
    browser's "online" event can still fail.
  - Logging out wipes every offline copy, because a shared phone must not
    keep someone else's feed.
  - The Privacy Policy (section 6, EN/AR, 2026-10-20) used to say the
    device "never" keeps your posts; it now says exactly what is kept.
- **Offline message queue (`71557a9`):**
  - A text sent with no connection waits, with a clock, "Waiting for
    connection" and a "Don't send" button.
  - It is kept per account and chat, so it survives a reload, and it is
    sent once, oldest first, when the connection or the socket comes back.
  - A socket send that times out because the connection dropped waits
    instead of failing.
  - Voice notes and photos are files the device can't keep this way;
    offline they still fail and offer Retry.
- **Install (`646c412`):** the browser's install offer is kept from
  startup, and "Install the app" in the Menu opens the browser's own
  dialog. iPhones and iPads get Safari's Share > Add to Home Screen steps
  in a sheet. The row is hidden once the app is installed.
- **Icons, manifest, service worker (`4dd9e64`):**
  - The maskable icon had a transparent background (launchers expect a
    full tile). It is regenerated opaque by
    `scripts/generate-maskable-icon.cjs`, and pwa.test rejects the old one.
  - The manifest gains id, lang and categories.
  - The service worker kept every same-origin file in one cache forever.
    It now has a shell cache (network-first; any route opens offline) and
    an assets cache (cache-first, newest 60 files); other caches are
    deleted.
  - On the production build (day72-pwa), offline, a full reload and a
    deep link still open the app with Home's saved posts.
- **Decision (logged):** offline data lives in localStorage in the app,
  not in the service worker. The API is another origin, and the app
  already knows the account (which data to keep, and when to wipe it).
  Photos aren't cached offline: browsers store cross-origin images as
  opaque responses, which use a lot of storage.
- **Seen, for later:**
  - The email-verification banner's amber text (#d97706 on #fef3c7) is
    about 2.9:1, below AA, and has no dark-mode colours. For Day 80
    (empty/error states) or Day 75.
  - The bundle is at 223.9 / 225 kB. For Day 74 (performance round 2).
- **Tests at close:**
  - Vitest 312/312; backend 950/950; lint; check:i18n 1415 keys;
    check:headers; bundle 223.9 kB.
  - Full browser run in small batches: all 62 regular suites (new:
    day72-offline 18, day72-install 6), the 7 special-stack suites (new:
    day72-pwa 6), journeys-social, perf 41/41, a11y 125 (3 parts) and A3
    EN/AR (288 each, 4 parts).

### 2026-10-20 — Day 74: Performance round 2
- **Lint first (`2a9710b`):** two lint errors from Day 73 had gone out
  unseen, because the check read the last line of output instead of the
  exit code. Fixed, and the rule is in WIP's notes.
- **Bundle (`2806cac`):** the animation library was 40 kB of the first
  download. It now loads its engine after the first paint (LazyMotion,
  strict). First download 223.9 -> 200.7 kB of the 225 kB budget.
- **Slow queries: Home by cursor (`27d8730`, `97a4e14`):**
  - Home paged by OFFSET, so page N read past every earlier post (page 20
    of 50 per page: 198 ms). GET /feed now returns nextCursor and takes
    ?cursor= (page= still works), and Home uses it: 14 ms for that page.
  - The first draft wrapped the cursor in a CASE (to handle a deleted
    cursor post). EXPLAIN showed Postgres then used it only as a filter,
    no faster than OFFSET. It is now a plain row comparison, which starts
    the index scan at the cursor. If the cursor's post was deleted, the
    next post by id marks the place.
  - New browser suite day74-feed-paging: 45 posts, two written in the
    same millisecond across a page break, EN/light and AR/dark.
  - Decision: Explore, hashtag, profile tabs and saved posts keep page=
    for now; they are lighter and fine in the perf suite.
- **Caching headers (`d8fef9a`):** API answers had no Cache-Control, so a
  browser could keep feeds, messages and notifications in its disk cache,
  where logout can't reach them. Every answer is now no-store unless its
  route allows caching (/config, the push key, share cards, docs, link
  previews), and those keep ETags and answer 304. The spec documents it.
  The Privacy Policy (section 6, EN/AR) says so.
- **Image sizes (`a5913a2`):**
  - Audit: every displayed image already asks Cloudinary for its size,
    except a draft's photos in the composer, which loaded full size into
    ~90 px tiles; they are now 300 px.
  - The browser shrinks photos before upload, but the server stored
    whatever arrived (up to 5 MB). A photo over 1 MB is now stored scaled
    to fit 2048 px. Smaller ones are left alone, because they are already
    shrunk and each Cloudinary transformation costs plan credits.
- **Perf suite: 8.5 min -> 1 min (`d9ec056`), instead of the planned
  split:**
  - Most of the time was an 11 s sleep per endpoint, waiting for Postgres
    to publish the server's scan counters. The suite now ends the app's
    idle connections, which publishes them at once (the pool reconnects).
  - This exposed a hidden dependency: right after seeding, the counts
    depended on whether autovacuum had run. The old suite passed only
    because it was slow. The seed now ends with VACUUM ANALYZE.
  - Mutation checks: a dropped index and the CASE cursor both fail it.
- **Slip:** step 2's commit left ciWorkflow.test red for one commit (a new
  e2e suite needs a README row; the backend run came before it). Fixed in
  the next commit, and the rule is in WIP's notes.
- **Tests at close:**
  - Vitest 313/313; backend 961/961; lint (exit 0); check:i18n 1415 keys;
    check:headers; bundle 200.8 kB.
  - Full browser run in small batches: all 64 regular suites (new:
    day74-feed-paging 18; day27-perf 43/43 in ~1 min), the 8 special-stack
    suites, a11y 125 (3 parts) and A3 EN/AR (288 each, 4 parts).

### 2026-10-21 — Days 75–76: Security round 2
- **Dependencies (`ff59e39`):**
  - sanitize-html had a moderate XSS-filter bypass, and the frontend's
    follow-redirects and source-map-js high advisories had CI's audit job
    red. All patched; in-range updates in all three folders. CI now fails
    on moderate advisories in production dependencies (high let the
    sanitizer's slip through).
  - Left on purpose: dotenv 18 and motion 14 (major versions), the
    myanmar-tools and swagger-ui-dist pins, and a dev-only jest advisory
    whose only "fix" is a downgrade.
  - The updates exposed two regressions. axe-core 4.14 checks "label in
    name", and the own-story button held its initials as text (Avatar got
    `decorative`). Vite 8.3 put Messages in files of its own, so opening it
    offline crashed. The service worker now caches every script and style
    of the build on install (the build writes the list into sw.js).
  - React 19.3 adds 8.3 kB: first download 211.2 / 225 kB.
- **Messages kept as typed (`5e1705d`):** checking the real sanitizer
  showed it ate text ("if x<y and y>z" became "if xz") and stored & < > as
  entities ("Tom &amp; Jerry"). Jest's stand-in hid this. Messages are now
  kept as typed, like posts and comments; every client shows them as text.
  Migration 071 (data only, must run once) decodes the saved ones. The
  rehearsal checks it with the old code too.
- **Routes and inputs (`ed6a81e`), each found by a sweep over the spec:**
  - A NUL character in any text was a 500 on every route, login and signup
    included, and filled Admin > Errors. It is now a clear 400 (EN/AR).
  - A JSON field sent as an object or array crashed signup, login,
    forgot-password, deactivate, delete and reports. A repeated query key
    crashed search. Fields are now read as text, and each query key is one
    string.
  - Every login-only route refuses no, forged and logged-out tokens; admin
    routes 404 to users; optional ones treat a bad token as logged out.
    Recording every status the suite produced found 6 changes by id with
    no stranger test; all were guarded, and now they are tested.
- **Uploads (`55d6e1c`):** files were judged by the claimed type, so a
  text file sent as image/jpeg cost a Cloudinary call and logged a 502.
  They are now checked by their first bytes before anything is sent or
  counted.
- **Sockets (`b58b852`):** a server error's own text (e.g. a database
  error) reached the client in message_error; it no longer does. New
  limits: 100 kB per event (was 1 MB), 120 events per 10 s per socket,
  and typing at most once a second per chat. check:i18n now also sees
  messages kept in constants (three had slipped out of its sight).
- **CSP (`a49ac72`):** the web app's policy now reports violations to the
  API, and they appear in Admin > Errors. Not verified end to end:
  Chromium's batched Reporting API delivery (nothing arrived in headless
  Edge). Admin > Errors will show it after GO LIVE.
- **Label in name (`5fbc11e`, `805a1c6`):** the full run caught a button
  whose label lacked its visible words. A scan of every labelled button
  fixed the rest (notifications' Open buttons, the group chat header, and
  six Arabic labels).
- **Slips:**
  - The local production server rewrote only the CSP header, so one test
    run sent a CSP report to the live API (404 there, nothing stored).
    serve-dist now rewrites every header.
  - A test once relied on migration 071 being safe to run twice; it is
    not, and the checklist now says so.
- **Tests at close:**
  - Backend 989/989; Vitest 318/318; lint (exit 0); check:i18n;
    check:headers; bundle 211.2 kB; GO LIVE rehearsal (--old) passed.
  - Full browser run in small batches: all 64 regular suites, the 8
    special-stack suites, a11y 125 (3 parts) and A3 EN/AR (288 each, 4
    parts).

### 2026-10-21/22 — Day 77: Account safety
- **Login alerts (`044ebfc`):** a login from a kind of device the account
  hasn't used in 180 days (browser + system + phone/desktop, as the
  Sessions screen shows it -- no IP addresses are kept) tells the owner:
  a notification naming the device with "Check your devices", a push, and
  an email (EN/AR) when email is set up. An account's first device is
  just remembered. Migration 072 (known_devices, pruned by the cleanup
  job, in the data export; notifications.device). Privacy Policy s8.
- **Suspicious login slowdown:** already built on Day 11 (per-account
  1-8 s waits, a cap on parallel attempts, the per-IP limiter) and tested
  (botProtection.test, e2e day11-bots). Verified, no code.
- **Two-factor authentication with an authenticator app** (TOTP, RFC
  6238 on node's crypto, checked against the RFC test vectors; no
  outside service):
  - API (`e9297da`): set up with a QR code (an SVG built on the server,
    so the web app needs no QR library; npm qrcode 1.5.4) or the key typed
    in, confirm with a first code, 10 one-time recovery codes (only their
    sha256 is kept). Turning off needs the password and a code or a
    recovery code; new codes need the password. Emails (EN/AR) when it is
    turned on or off. Migration 073.
  - Guessing: each code works once (a used 30-second step is refused, even
    by two racing requests), and more than 10 wrong codes in 15 minutes
    lock codes out until the window ends. Better than the plan's
    in-memory throttle: the count is kept in the users row, so every
    server instance shares it and a restart doesn't reset it.
  - Login (`7b1c0fe`): a right password on an account with 2FA answers
    with a 5-minute challenge, not a session; POST /login/2fa finishes it.
    The challenge is signed with a key derived for that purpose only (a
    session token can't be used as one, nor the other way round) and ends
    if the password changes or 2FA is turned off. Bans are checked at
    both steps; reactivation and the new-login alert wait for the code.
  - Settings > Two-factor authentication (`0bcc641`) and the login's
    "Enter your code" step (`5d24b2a`), EN/AR with RTL (keys and codes
    stay left to right), light/dark. A recovery-code login opens the
    Two-factor screen with what to do if the phone is lost.
  - Not done: the key is stored as it is. Encrypting it needs a key the
    owner sets and keeps (rotating JWT_SECRET must not lock people out),
    so it waits for the scaling work after funding.
- **Tests at close:**
  - Backend 1013/1013 (new: loginAlerts 6, twoFactor 11, twoFactorLogin
    7); Vitest 330/330; lint (exit 0); check:i18n; check:headers; bundle
    212.5 / 225 kB; GO LIVE rehearsal (--old) passed with 072 and 073;
    the checklist's counts (30/30/16) checked on a fixture DB.
  - Full browser run in small batches: all 65 regular suites (new:
    day77-login-alert 13, day77-two-factor 37 -- it works out real codes
    from the key the screen shows and logs in through the form), the 8
    special-stack suites, day27-perf, a11y (3 parts, 0 serious/critical)
    and A3 EN/AR (147 page checks in each of 4 parts, 0 failures).

### 2026-10-22 — Days 78–79: Onboarding
- **What a new account sees (Facebook/Instagram-style first run):** after
  its first login (after the code step when 2FA is on), "Get started"
  opens: four quick cards with progress dots, no tab bar, Back, and
  "Skip" from anywhere.
  1. Welcome by name + the app language (switches at once, saved on the
     account).
  2. A profile photo, uploaded on its own and shown.
  3. People to follow: friends of friends, or the most-followed accounts
     for a brand-new one; Follow works in place; with nobody to suggest
     it says where to find people later.
  4. A short tour of where things are (Home and "What's on your mind?",
     Search, Messages, the Menu), with the app's own icons.
  "Get started" opens Home, already showing the posts of whoever was
  followed. Finishing or skipping is saved, so the next login goes
  straight Home; if saving fails the person still gets in.
- **API (`8574ddf`):** migration 074 (users.onboarded_at; existing
  accounts are marked done as of their creation, so only new sign-ups see
  the steps -- the GO LIVE rehearsal checks it). needsOnboarding in the
  login answer, onboarded_at in GET /profile/me and the export, POST
  /profile/onboarding/done. Better than reusing PUT /profile for the
  photo: that saves every field at once and would wipe the bio, so PUT
  /profile/avatar sets the photo alone.
- **UI:** `b9b2942` (language, photo, the Login redirect), `f068c77`
  (people, tour).
- **Found on the way:** suggestions said "Popular · 1 followers" (Explore
  too); the reason now has plural forms, every Arabic form included.
- **Tests changed on purpose:** J1 and day11-bots now expect a new
  account's first login to open the steps; the browser seed accounts are
  marked done. day53-page-admins counted the admin list before it loaded
  (flaky once in the full run); it now waits for it.
- **Tests at close:**
  - Backend 1019/1019 (new: onboarding 6); Vitest 338/338; lint (exit 0);
    check:i18n; check:headers; bundle 213.0 / 225 kB; GO LIVE rehearsal
    (--old) passed with the 074 check; checklist counts (30/31/16) on a
    fixture DB.
  - Full browser run in small batches: all 65 regular suites, the 9
    special-stack suites (new: day78-onboarding 30, on the media stack
    with a real photo upload), day27-perf, a11y (3 parts, 0
    serious/critical) and A3 EN/AR (150 page checks in each of 4 parts,
    0 failures).

### 2026-10-22/24 — Day 80: Empty/error states
- **How (better than checking screens by eye):** a new browser suite,
  day80-states, opens 35 data screens as a brand-new account three ways
  -- empty, with every API read failing, and offline (before and after
  the screen's code was downloaded) -- in English/light and Arabic/dark.
  Each screen must say something, a failed load must offer Try again,
  and offline must never show the crash screen. Every empty state was
  already friendly; the failures it found are fixed:
- **Offline crash (`edcf5f7`):** opening almost any screen in the app
  while offline showed "Something went wrong": screens load on demand and
  their code couldn't download (in production the same on a first visit,
  before the service worker installs, or with a tab open across a new
  deploy). Screens now load through lazyScreen(): offline it says so and
  opens by itself when the connection is back; online it offers Reload
  ("a new version is ready") and reports it to Admin > Errors.
- **Honest failures (`0316658`):**
  - Offline, a failed list says "You're offline" and reloads by itself
    when the connection returns (the shared error state of 38 screens,
    and the chats list).
  - Search and Explore said "Nothing trending yet" when trending failed.
  - Followers/following had no Try again.
  - A chat you're not in showed the notice, an error and the message box
    at once; now the notice and "Back to Messages" only.
  - A missing page offered a pointless Try again (now "Back to Pages");
    an event that failed said "Couldn't load events."
- **Slip:** after an interruption, a run started with `&` kept going in
  the background and its teardown stopped the next run's database. Long
  runs now always use a tracked background task (WIP lessons).
- **Tests at close:**
  - Backend unchanged since Day 78 (1019/1019); Vitest 348/348 (new:
    lazyScreen 5, FeedErrorState/Trending 5); lint (exit 0); check:i18n;
    check:headers; bundle 213.9 / 225 kB.
  - Full browser run in small batches: all 65 regular suites, the 9
    special-stack suites, day80-states (146 checks in each language),
    day27-perf, a11y (3 parts, 0 serious/critical) and A3 EN/AR (150
    page checks in each of 4 parts, 0 failures).
