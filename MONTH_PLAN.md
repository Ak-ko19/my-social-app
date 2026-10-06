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
   - check light/dark theme, mobile width, and EN/MY/AR + RTL (once i18n exists);
   - re-read your whole diff as a strict reviewer against the Quality bar.
4. FIX — Fix everything the verification found, then VERIFY again. Repeat until clean.
5. SAVE — Commit with a clear message, push to dev, tick the checkbox, update WIP.md ("step done").
6. PAUSE — Take stock before moving on: print a short step report (what was built, what was verified, any concerns), re-read MONTH_PLAN.md and the next step, then start the next step's PLAN right away, in the same turn. PAUSE does NOT mean ending the turn: keep going step after step until the owner presses Esc.

Commit and push ONLY at step 5 (once per finished step). Do not commit half-finished work.

Never end the turn while waiting for tests: run them in the foreground and wait for the result (long runs: use a wait loop in the same turn), then continue.

## When the owner presses Esc
The owner may press Esc for an emergency, when the usage limit is near, or to end the day's work. So:
- WIP.md must always show the current Day, step, plan, and which parts are done (update it as you go — it is a file, not a commit).
- When resuming: read WIP.md, run `git status` and `git log -5`. Uncommitted changes = an unfinished step. Review them carefully: if they are good, continue that step from where it stopped; if broken or unclear, revert them and restart that step from PLAN. Never commit leftover work without running the full VERIFY.
- When a whole Day is done: add the Progress Log entry, clear WIP.md, commit, push.

## Quality bar (every task, no exceptions)
Build every feature the way a senior engineer at a top social media company would ship it to millions of users.
1. Think first: before coding, read the related code, check how Facebook/Instagram/X handle the same feature, and write a short plan in WIP.md covering data model, API, UI, edge cases, and security.
2. Complete, not minimal: backend + database migration + API validation + frontend UI + real-time updates where it makes sense + notifications where it makes sense + translations (EN/MY/AR, RTL correct — once i18n exists) + light and dark theme.
3. Edge cases: empty states, loading states (skeletons), errors, offline, very long text, Myanmar and Arabic text, blocked users, private accounts, deleted content, duplicate clicks, slow network.
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

### Day 16 — Myanmar
- [x] Myanmar translations (Unicode) + a proper Myanmar web font; language switcher in Settings; save choice per user. *(Translations, Noto Sans Myanmar and the switcher since B15; per-user saving added Day 16.)*

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
- [ ] Trending hashtags, popular posts (last 7 days), explore by hashtag.
### Day 42 — Better search
- [ ] PostgreSQL full-text search with ranking; search history; filters (people/posts/hashtags).
### Day 43 — Myanmar text support
- [ ] Detect Zawgyi text and convert to Unicode (local library, no API) in posts, comments, messages, search.
### Day 44 — Polls
- [ ] Poll posts with options, vote once, results bar.
### Day 45 — Drafts + scheduled posts
- [ ] Save drafts; schedule a post (runs via the existing cron job).
### Day 46 — Saved collections
- [ ] Organize bookmarks into named collections.
### Day 47 — Privacy controls
- [ ] Mute user, restrict user, close friends list, who can message/comment on me.
### Day 48 — Activity log
- [ ] Your likes, comments, searches; delete items.
### Day 49 — Content filtering
- [ ] Local bad-word list (EN/MY/AR) with hide-or-warn option; spam detection (repeated links, flood posting).
### Day 50–52 — Groups (basic)
- [ ] Create group, public/private, join/leave/request, group posts, group admins, group moderation.
### Day 53–54 — Pages (basic)
- [ ] Create page, follow page, post as page, page admins.
### Day 55–56 — Events (basic)
- [ ] Create event, going/interested, event page, reminders via notifications.
### Day 57 — Storage safety
- [ ] Check Neon and Cloudinary usage; client-side image compression before upload; limits per user; warn in admin panel near limits.
### Day 58 — Accessibility + translations check
- [ ] All new screens translated (EN/MY/AR) and RTL-correct.
### Day 59 — Re-audit (AUDIT_REPORT_3.md)
### Day 60 — GO LIVE (only if you have the access)

---

## PHASE 3 — Days 61–90: Quality, admin, and long-term health

### Day 61–62 — Admin dashboard
- [ ] Users, posts, reports, signups per day, storage usage, error log — charts built locally, no outside analytics.
### Day 63 — Audit log
- [ ] Record admin actions (who removed what, when).
### Day 64–66 — End-to-end tests
- [ ] Playwright tests for the 15 most important user journeys; run in CI.
### Day 67–68 — API documentation
- [ ] OpenAPI spec for every endpoint; docs page for developers.
### Day 69–71 — Code health
- [ ] Remove duplicated logic, split large files, consistent error handling, update README and CLAUDE.md.
### Day 72–73 — Offline + PWA polish
- [ ] Offline feed cache, offline message queue, install prompt, app icons.
### Day 74 — Performance round 2
- [ ] Slow-query review, caching headers, image sizes, bundle splitting.
### Day 75–76 — Security round 2
- [ ] Re-check every route, file upload, socket event; dependency updates; CSP headers.
### Day 77 — Account safety
- [ ] Login alerts in notifications (new device), suspicious login slowdown, 2FA with authenticator app (TOTP — no outside account needed).
### Day 78–79 — Onboarding
- [ ] First-run steps: profile photo, follow suggestions, language choice, tour.
### Day 80 — Empty/error states
- [ ] Friendly screens for every empty list, error, and offline case, in 3 languages.
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
