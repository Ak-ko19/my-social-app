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
6. PAUSE — Stop and take stock before moving on: print a short step report (what was built, what was verified, any concerns), re-read MONTH_PLAN.md and the next step, and only then start the next step's PLAN.

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
- [ ] Enable rate limiting in a dedicated test so this bug cannot return (7 users must not block each other).
- [ ] GET /feed includes the viewer's own posts; a new post appears at the top immediately.

### Day 3 — Startup safety + small bugs
- [ ] Validate all required env vars at startup with a clear error message; read PORT from env.
- [ ] Add security headers on the frontend (Vercel config).
- [ ] Fix the remaining Low bugs from the audit.

### Day 4 — Cloudinary cleanup
- [ ] Deleting a post, story, message, or account deletes its images/voice notes from Cloudinary.
- [ ] Store Cloudinary public_id wherever it is missing (migration if needed).
- [ ] Script to find and delete orphaned Cloudinary files (dry-run mode first).

### Day 5 — Working email in production
- [ ] Add an HTTP email adapter (Brevo API) that turns on automatically only when its env var exists. Keep Nodemailer for local dev.
- [ ] In production, NEVER write reset/verification links to logs.
- [ ] Graceful fallback when no email provider is configured: the app must not break or lock users out (e.g. skip the verification requirement and show a friendly message on forgot-password).
- [ ] Note in LATER.md: "Add Brevo API key to turn on real emails."

### Day 6 — Go-live preparation
- [ ] Write GO_LIVE_CHECKLIST.md: backup, migrations 015–027, env vars, deploy order, rollback steps.
- [ ] Test migrations 015–027 on a fresh local DB copied from the production schema.
- [ ] Check what access exists: production DATABASE_URL, whether pushing to main auto-deploys on Render/Vercel.

### Day 7 — GO LIVE #1 (only if you have the access)
- [ ] If you have production DB access: take your own backup with pg_dump to a local file first. If no access, skip GO LIVE, note it in LATER.md, and continue with Day 8.
- [ ] Follow GO_LIVE_CHECKLIST.md: run migrations, deploy backend and frontend, merge dev → main.
- [ ] If anything fails on live: roll back immediately (revert main, restore backup) and note it in LATER.md.
- [ ] Smoke test the live site: signup, login, post, image, like, comment, DM, voice message, notifications, password reset.
- [ ] Confirm CI and keep-alive now run on main.

---

## WEEK 2 — Security and reliability

### Day 8 — Session revocation
- [ ] Changing the password signs out other devices (token version or refresh-token table).
- [ ] "Log out of all devices" in Settings; active sessions list.

### Day 9 — Cleanup jobs
- [ ] Scheduled job (GitHub Actions cron calling a protected endpoint) to delete expired stories and old notifications, including their Cloudinary media.

### Day 10 — Monitoring
- [ ] Built-in error logging (errors saved to a DB table + admin view). Add a Sentry hook that turns on only if its env var exists.
- [ ] /health endpoint checks DB connectivity; structured logging; remove stray console.logs.

### Day 11 — Bot protection
- [ ] Bot protection that needs no outside account: honeypot fields, minimum form-fill time, progressive delays after failed logins, stricter limits on signup/forgot password.
- [ ] Add a Turnstile hook that turns on only if its env var exists.

### Day 12 — Moderation
- [ ] Report comments and messages.
- [ ] Admin report-review page (admin role, list, resolve, remove content, suspend user).

### Day 13 — Test coverage
- [ ] Add browser suites to CI.
- [ ] Set up Vitest + React Testing Library with tests for the main components.

### Day 14 — GO LIVE #2 (only if you have the access) + buffer
- [ ] Finish anything left from Week 2, deploy, smoke test, merge to main.

---

## WEEK 3 — Languages and core social features

### Day 15 — i18n framework
- [ ] Add react-i18next; move all UI text into English translation files.

### Day 16 — Myanmar
- [ ] Myanmar translations (Unicode) + a proper Myanmar web font; language switcher in Settings; save choice per user.

### Day 17 — Arabic + RTL
- [ ] Arabic translations; full right-to-left layout (dir="rtl", logical CSS properties); check every screen.

### Day 18 — Comment replies + reactions
- [ ] Threaded replies to comments (if AUDIT_REPORT.md marks missing).
- [ ] Reactions beyond like (if missing).

### Day 19 — Link previews + share cards
- [ ] Link previews in posts and messages (server-side fetch with timeout and size limit).
- [ ] Open Graph share cards for public post URLs.

### Day 20 — Posts upgrade
- [ ] Multiple images per post (if missing).
- [ ] Per-post privacy: public / followers / only me (if missing).

### Day 21 — GO LIVE #3 (only if you have the access) + buffer

---

## WEEK 4 — Engagement and polish

### Day 22 — Push notifications
- [ ] Web push (VAPID, via the existing PWA service worker).

### Day 23 — Notification settings
- [ ] Per-type on/off (likes, comments, follows, messages), mute a conversation.

### Day 24–25 — Next P1 features from the gap list
- [ ] Take the highest-priority free-tier-compatible P1 items from AUDIT_REPORT.md (e.g. friend requests or basic groups) and build them.

### Day 26 — Accessibility
- [ ] Keyboard navigation, focus states, alt text on images, labels, colour contrast in both themes.

### Day 27 — Performance
- [ ] DB indexes for slow queries, responsive Cloudinary image sizes, lazy loading, bundle check.

### Day 28 — Privacy
- [ ] "Download my data" export; make the Privacy Policy match what the app really does.

### Day 29 — Re-audit
- [ ] Repeat the full read-only audit; write AUDIT_REPORT_2.md comparing with the first audit.

### Day 30 — GO LIVE #4 (only if you have the access)
- [ ] Deploy and smoke test. Fix any top items from AUDIT_REPORT_2.md first.


---

## PHASE 2 — Days 31–60: Richer social features

### Day 31–32 — Messaging upgrade
- [ ] Reply to a message, react to a message, edit/unsend, forward.
### Day 33–35 — Group chats
- [ ] Create group, add/remove members, admins, group name/photo, real-time via Socket.io.
### Day 36 — Profile upgrade
- [ ] Cover photo, links, joined date, pinned post.
### Day 37–38 — Friend requests (if missing)
- [ ] Send/accept/decline/cancel, friends list, mutual friends.
### Day 39 — People you may know
- [ ] Suggestions from mutual follows/friends; no external services.
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
