# MySocialApp — Full read-only audit

**Date:** 2026-09-28
**Code audited:** branch `dev` @ `ad09816`, clean working tree.
**Scope and method:**
- Read the code and the migrations.
- Ran the backend test suite (233 tests).
- Ran all 19 browser suites (281 checks) in headless Edge against a
  throwaway local stack.
- Ran 33 targeted API/Socket.io probes, and a proxy rate-limit test with
  the backend in non-test mode.

No application code was changed; only this file was written. It replaces
the previous (C4) version.

**Assumptions and limits:**
- `.env` files and the production database (Neon) were not read.
  Production config values are therefore unknown, and env vars are listed
  by name only, taken from the code and `.env.example`.
- Voice messages and real image uploads need Cloudinary credentials, which
  local dev doesn't have. They are verified through API tests with mocked
  uploads plus code reading, not end to end.
- The A3 visual matrix (every route × 3 widths × light/dark) was not rerun
  today. The app code is identical to `e0949a2`, where it passed 222/222 in
  English, Myanmar and Arabic on 2026-09-27; commits since then only touched
  docs and `e2e/`.

---

## 1. Summary

**Overall health: good code, risky delivery.**
- The app on `dev` is feature-rich and well tested:
  - 233/233 API tests;
  - 281/281 browser checks;
  - 32/33 probes pass. The one failure is a real bug (own posts
    missing from the feed; see below). A first message-delete probe was
    malformed on my side and passed once corrected.
- Code quality is high: no TODO/FIXME markers, parameterised SQL, auth on
  every protected route, input validation, upload filtering.
- The main problems are around shipping it, not the code itself.

**Top 5 risks**

1. **Everything since Sep 22 exists only on this laptop.**
   - `dev` has never been pushed and has no upstream.
   - It holds 66 commits (B1–B16, C1–C4) that aren't on GitHub.
   - One disk failure loses all of it.
2. **Production is far behind.**
   - `master` (`3c5d884`, Sep 22) is what's deployed. Its migrations stop
     at 014, and it has no CI or keep-alive workflows.
   - None of reactions, stories, groups, pages, i18n, admin and so on is
     live.
   - An investor demo on the live site shows the old app.
3. **Rate limiting is broken behind Render's proxy (Critical, live now).**
   - There is no `trust proxy` setting, so all users share one bucket.
   - 5 failed logins from anyone lock everyone out of login for 15
     minutes, and 300 requests per 15 minutes is the cap for the whole
     site.
4. **Password reset and email verification likely don't work in
   production.**
   - Render's free tier blocks outbound SMTP, and email isn't configured
     (Phase 2 still open).
   - Without email settings, the fallback writes live reset and
     verification links into the server logs.
5. **Deleted content's media is never deleted from Cloudinary.**
   - Photos, voice notes and avatars stay publicly reachable by URL after
     a post, story, message or whole account is deleted.
   - That contradicts the Privacy Policy draft ("deleting your account
     removes your data"), and the files pile up on the free-tier quota.

---

## 2. Git & deployment status

| Item | State |
| --- | --- |
| Current branch | `dev` @ `ad09816`, working tree clean |
| Branches | `dev`, `master`, `feature/feed-production-ui` (old, fully merged — 0 commits not on `dev`); remote: `origin/master` only |
| `dev` vs GitHub | **No upstream. 66 commits exist only locally** (`master..dev`) |
| `master` vs `origin/master` | In sync (0 ahead), at `3c5d884` from Sep 22 |
| `main` branch | Doesn't exist; the default branch is `master` |
| Deployed backend (Render) | `https://my-social-app-ecjg.onrender.com`, running `master`-era code. Cold start measured at **22.9 s** on 2026-09-27; warm 0.9 s |
| Deployed frontend (Vercel) | `frontend/vercel.json`: SPA rewrite and immutable caching of `/assets`. No security headers (CSP, X-Frame-Options) on the frontend |
| Production DB (Neon) | Not inspected. Based on `master`'s files it's at migration 014; `dev` needs **015 → 027** (021 on its own) before deploying |
| CI / keep-alive | Both workflows (`.github/workflows/ci.yml`, `keepalive.yml`) exist **only on `dev`**, so they have never run on GitHub |
| Migrations | 27 numbered migrations (001–027), with up and down scripts from 003 onward. Each new one was verified up/down/up on a throwaway DB when it was added |

**Env vars.** Values weren't read.

- Backend: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `ALLOWED_ORIGINS`,
  `FRONTEND_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`,
  `EMAIL_PASS`, `EMAIL_FROM`.
- Frontend: `VITE_API_URL`. It's committed in `frontend/.env.production`,
  which is fine because it's a public URL.
- Not read: `PORT`. The server hardcodes `3000`; Render detects the open
  port, but `process.env.PORT` is the supported contract.
- There is no startup check that the required vars exist. For example, a
  missing `JWT_SECRET` gives 500s on login instead of refusing to start.

**CORS.**
- REST and Socket.io share one allowlist, `ALLOWED_ORIGINS`
  (`config/allowedOrigins.js`).
- Requests with no Origin header (curl, mobile) are allowed, which is
  normal.

**Cloudinary.**
- Used for post images, avatars, stories, chat photos and voice notes.
- The upload filter only accepts JPEG/PNG/GIF/WebP or audio, capped at
  5 MB.
- There is **no delete call anywhere** (`uploader.destroy` is never used).

**Socket.io in production.**
- It's a single instance with in-memory presence and in-memory
  per-conversation send limits. That's fine on one Render instance, but
  it can't scale to more than one without a shared adapter such as Redis.
- Sockets drop whenever the free instance spins down.

---

## 3. Feature verification

**Legend:**
- ✅ works;
- ⚠️ partial or unverified in production;
- ❌ broken;
- ⛔ missing.

**Evidence abbreviations:**
- `API:x` — backend test file `backend/tests/api/x.test.js`;
- `E2E:x` — browser suite `e2e/x.cjs`;
- `P` — today's probe.

### Core

| Feature | Status | Evidence | Issues |
| --- | --- | --- | --- |
| Signup | ✅ | `POST /signup` (`authController.signup`, `users`), `Signup.jsx`; API:auth; P (201) | — |
| Login + JWT | ✅ | `POST /login` → JWT (7 days); `authMiddleware`; P: missing or tampered token → 401 | Tokens can't be revoked (see §5) |
| Input validation | ✅ | P: duplicate email, missing fields, bad email, short password → 400; `PUT /profile` validates email | — |
| Profile view/edit, bio | ✅ | `GET /profile/:id`, `/profile/me`, `PUT /profile`; `EditProfile.jsx`, `ProfileScreen.jsx`; P (bio round-trip); E2E:b6 | — |
| Profile picture | ⚠️ | Multer + Cloudinary (`upload.single('avatar')`); API:profile (mocked upload) | Can't test end to end without Cloudinary; old avatars are never deleted from Cloudinary |
| Post CRUD + owner check | ✅ | `routes/postRoutes.js`, `postController`; P: someone else's edit → 403; API:post | — |
| Post images | ✅ | Up to 10 per post (`post_media`); E2E:b2 14/14 | Media not deleted when the post is deleted |
| Feed pagination | ✅ | `GET /posts?page=&limit=` → `{posts, hasMore}`; P | — |
| Personalized feed `/feed` | ❌ | `postController.getFeed`; used by HomeFeed via `useFeed` | **Your own posts never appear on Home** (the known open item, still open). P: a new post by alice was missing from alice's `/feed` |
| Likes (+ reactions) | ✅ | `likes.reaction`; E2E:b1 14/14; API:like, API:reaction | — |
| Comments, replies, comment likes | ✅ | `commentController`; E2E:b4 15/15 | — |
| Comment edit | ✅ | `PUT /comments/:id`; P: author 200, others 403 | — |
| Follow system (+ private-account requests) | ✅ | `followRoutes`; API:follow; E2E:a2 | — |
| Search (users + posts) | ✅ | `/search/users`, `/search/posts` (trigram indexes); P | — |
| Notifications (like/comment/follow, badge, mark-as-read) | ✅ | `notificationService.notify`; P: like + comment created, one read, then all read (2→1→0); the badge matches the API count | — |
| Forgot password | ⚠️ | Hashed single-use token, 1 h expiry; P: request → link → reset → log in again works locally, and reuse is rejected | Production can't deliver the email (Phase 2, SMTP blocked on Render free), and the fallback logs the link |

### Messaging

| Feature | Status | Evidence | Issues |
| --- | --- | --- | --- |
| Real-time DM (Socket.io) | ✅ | `sockets/index.js` `send_message` → `new_message` + ack; P; E2E:b9 15/15 | Single instance only (§2) |
| Typing indicator | ✅ | `typing` → `user_typing`; P | — |
| Online/offline | ✅ | `user_online`/`user_offline`, `users.last_seen`; P | — |
| Sent / delivered / read | ✅ | `mark_delivered`/`mark_read` → `message_status_update`; P: events delivered,read and the database row reads `read` | — |
| Voice messages | ⚠️ | `POST /conversations/:id/messages/voice` (audio filter, 5 MB, mp3 delivery); API:dmExtras (mocked) | Not testable end to end locally (Cloudinary). A Cloudinary failure reaches the user as a 400 with the provider's raw text |
| Message delete (`deleted_at`) | ✅ | Soft delete via REST or socket; P: `deleted_at` set and `message_deleted` broadcast | The socket payload requires `conversationId` (by design) |

### Feature batch

| Feature | Status | Evidence | Issues |
| --- | --- | --- | --- |
| Block user | ✅ | `blockRoutes`, `blockService`; API:block; hides both ways | — |
| Report post/user | ✅ | `reports` table, rate-limited; E2E:b12 | Comments, messages, groups and pages **can't be reported** (the enum only allows `post` and `user`) |
| Bookmark | ✅ | API:bookmark; Saved tab, `/saved` | — |
| Post edit/delete UI | ✅ | `PostMenu.jsx` (edit/delete/audience); E2E:b5, b13 | — |
| Share post | ✅ | `PostCard.handleShare`: `navigator.share`, falling back to the clipboard; `/posts/:id` public detail page | No link preview or OG tags on the shared URL (SPA) |
| Hashtags | ✅ | `hashtagService` (parse and sync), `/hashtag/:tag`; E2E:b7 | — |
| @mentions | ✅ | `mentionService` (batched notifications, posts and comments), autocomplete | — |
| Public/private account | ✅ | `users.is_private` and follow requests; API:visibility | — |
| Change password | ✅ | Account Management screen; API:auth | Doesn't log out other sessions |
| Deactivate / delete account | ✅ | Cascading delete (migration 013); typed confirmation | Cloudinary media stays online |
| Email verification | ⚠️ | Hashed token; P: link verifies locally; banner in the UI | Same production-email issue as forgot password. Login doesn't require verification (by design) |
| Rate limiting | ❌ | `middleware/rateLimiter.js` (global, login, signup, reset, report, follow) | **Keyed on the proxy IP**: P showed 7 different clients sharing one bucket (6th attempt got 429). Limiters are disabled under `NODE_ENV=test`, so no test caught this |
| PWA | ✅ | P: `manifest.webmanifest` (name, 3 icons, start_url) and `sw.js` served; SW registered in production only | — |

### UI

| Feature | Status | Evidence | Issues |
| --- | --- | --- | --- |
| Design tokens, light/dark theme | ✅ | `styles/tokens.css`, ThemeProvider; A3 checks for light surfaces in dark mode | — |
| Virtualization | ✅ | `@tanstack/react-virtual` in `FeedList` and `ConversationList` | — |
| Skeletons, optimistic UI, animations | ✅ | `FeedSkeleton`, `PostCardSkeleton`; optimistic like, bookmark and follow hooks with rollback; `motion/react` with reduced-motion support | — |
| Hamburger Menu | ✅ | `/menu` (`MenuScreen.jsx`) | It's a full-screen route, not a sliding drawer |
| Settings screen | ✅ | `SettingsScreen.jsx`; E2E:b11 | Several rows are "Coming soon" placeholders (Content Preferences, Story Settings, Help…) |

### Known open items

| Item | Status | Evidence / notes |
| --- | --- | --- |
| Real email sending (Nodemailer) | ⚠️ Not working in production (assumed) | `utils/email.js` uses SMTP if `EMAIL_HOST/USER/PASS` are set, otherwise it logs. Production values couldn't be checked. Render's free tier blocks SMTP, so it needs an HTTP email API (e.g. Brevo or Resend free tiers) |
| `GET /feed` excluding the viewer's own posts | ❌ Still open | Confirmed by probe (see Bugs #3) |
| Admin report-review page | ✅ | `/admin` (B12): review, dismiss, remove post, ban/unban; E2E:b12 13/13 |
| Render keep-alive | ⚠️ Built, not running | `keepalive.yml` pings `GET /` every 10 min, but it's only on `dev`; cold start 22.9 s |
| i18n (EN + MY + AR RTL) | ✅ on `dev` | 763 keys × 3 languages, all plural forms, and `check:i18n` in CI. Arabic has full RTL. E2E:b15 12/12, b16 16/16. Not deployed |

---

## 4. Bugs found

| # | Severity | Bug | Evidence | Suggested fix |
| --- | --- | --- | --- | --- |
| 1 | **Critical** | Rate limiters key on the proxy IP behind Render. All users share every bucket: 5 failed logins by anyone lock login for everyone for 15 minutes, and 300 requests per 15 minutes is a site-wide cap. It's live in production today | Probe: `X-Forwarded-For` 203.0.113.1–7 → 401 ×5, then 429 ×2; Express logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`; `grep "trust proxy"` finds nothing | `app.set('trust proxy', 1)` in `server.js`, plus a test that runs the limiter outside `NODE_ENV=test` |
| 2 | **Critical (process)** | 66 commits exist only on the local disk; `dev` has no remote | `git branch -a`, no upstream | `git push -u origin dev` (owner) |
| 3 | **High** | Home (`/feed`) never shows your own posts, so after posting, the post "disappears" | `postController.getFeed` only selects `posts.user_id IN (followed accounts)` plus page follows; probe confirmed | Also include `posts.user_id = $1` (with `page_id IS NULL`) |
| 4 | **High** | In production, password reset and email verification can't reach users (SMTP blocked on Render free, email not set up). When unconfigured, `utils/email.js` logs the full reset or verify link, a live credential, to the server logs | `utils/email.js`; ROADMAP Phase 2 🟡 | Use an HTTP email provider. Never log the token, only "email not configured" |
| 5 | **High** | Uploaded media is never deleted: post, story and message deletion, account deletion, and avatar replacement all leave the files public on Cloudinary. This contradicts the Privacy Policy draft and grows the free-tier usage | No `uploader.destroy` in the codebase | Store the Cloudinary `public_id`s and delete them on delete (a queue or best-effort) |
| 6 | Medium | JWTs (7 days, stored in localStorage) can't be revoked. Changing or resetting the password doesn't sign out other devices, and there's no "log out everywhere" | `authController` `jwt.sign(..., {expiresIn:'7d'})`; nothing in `changePassword` | A `token_version` column checked in `authMiddleware` and `socketAuth` |
| 7 | Medium | No startup check for required env vars (`JWT_SECRET`, `DATABASE_URL`…) and the port is hardcoded to 3000 | `server.js:33` | Fail fast on missing vars; `process.env.PORT \|\| 3000` |
| 8 | Medium | Expired stories, story views and old notifications are never deleted, so tables grow forever on Neon's 0.5 GB | No cleanup job exists | A daily cleanup (a GitHub Actions cron calling an admin endpoint, or on-request pruning) |
| 9 | Medium | Only posts and users can be reported (`report_target_type`), not comments, messages, groups or pages | Schema enum | Extend the enum, the API and the moderation UI |
| 10 | Low | A Cloudinary or upload failure is returned as HTTP 400 with the provider's raw message (e.g. "cloud_name is disabled") | Probe on the voice endpoint | Return 502 with a generic message |
| 11 | Low | `PostCard` renders `post.linkPreview.url` as a link without checking the scheme. It's never populated today, but it would allow `javascript:` URLs if link previews were added naively | `PostCard.jsx:244` | Allow `http(s)` only when link previews are built |
| 12 | Low | The frontend (Vercel) sends no security headers (CSP, X-Frame-Options, Referrer-Policy); helmet only protects the API | `vercel.json` | Add a `headers` block |

---

## 5. Security, performance and code-quality findings

**Security (beyond the bugs above)**

- ✅ **Auth coverage:** all 99 routes are classified as 70 login, 5 admin
  (login plus `requireAdmin`, which answers 404 to others), 18 optional-auth
  reads that go through `postVisibilityService`, and 6 intentionally
  public ones.
  - Socket connections need a valid JWT and a non-banned user.
  - Banned users are refused on login, REST and sockets.
- ✅ **Owner checks:** edit/delete of posts and comments, messages
  (participants only), groups (admin), pages (owner), notifications, and
  follow requests. The probes confirmed the 403s.
- ✅ **SQL injection:** every query is parameterised. The only dynamic
  fragments are whitelisted column names or numbered placeholders.
- ✅ **XSS:** no `dangerouslySetInnerHTML`, `eval` or `innerHTML`; React
  escapes user text (a probe with `<img onerror>` was stored as text).
  - Weak point: the token lives in localStorage, so any future XSS could
    read it.
- ✅ **File uploads:** image and audio MIME allowlists, a 5 MB cap, and
  wrong-type files rejected (probe: `.sh` → 400).
- ✅ **Secrets:** `.env` was never committed. The only credential-like
  literal is the demo password in `scripts/seed-demo.js`, which only runs
  locally.
- ✅ **Tokens and headers:** reset and verification tokens are
  SHA-256-hashed, single-use and expiring; helmet is on the API.
- ⚠️ **Missing protections:**
  - No CAPTCHA on signup; spam accounts are only rate-limited, and that
    limiter is broken per #1.
  - No 2FA.
  - No audit log of admin actions beyond the report resolution fields.

**Performance**

- ✅ **Speed:** API medians on the demo data (local): `/feed` 7 ms, others
  11–19 ms.
- ✅ **Queries:** no N+1 patterns. Counts use indexed correlated
  subqueries, and hashtag/mention writes are batched.
- ✅ **Indexes:** 73 created across the migrations (feed, comments,
  notifications, trigram search, foreign keys for cascades, conversation
  participants, communities, pages).
- ✅ **Bundle:** first-load JavaScript is 209.7 kB gzipped (main chunk
  101 kB, i18n library plus English 25 kB). Myanmar and Arabic load on
  demand (13 kB each). Every screen except Home is lazy-loaded.
- ⚠️ **External dependency:** Google Fonts. There were intermittent
  timeouts during testing; self-hosting the three fonts would remove the
  dependency.

**Free-tier limits**

- **Render (512 MB):**
  - Memory: one Node process with Socket.io uses well under the limit.
  - Spin-down: the instance sleeps after about 15 minutes (22.9 s cold
    start, sockets drop).
  - Keep-alive: keeping it awake uses about 730 of the 750 free hours.
  - Email: SMTP is blocked.
- **Neon (0.5 GB):** text data is small. The risks are unbounded
  notifications, messages and expired stories (#8) plus the trigram
  indexes; add pruning before real growth.
- **Cloudinary free (25 credits):** no deletions (#5), and voice notes are
  converted to mp3. Monitor usage.

**Code quality**

- ✅ **Markers and logging:** no TODO/FIXME/HACK markers. There are 3
  `console.log`s (server start, socket disconnect, email fallback) and 137
  `console.error`s (with no structured logging).
- ✅ **Structure:** consistent shape (routes → controllers → services).
  Shared helpers exist for visibility, reactions, media and page columns,
  and server-error texts.
- ⚠️ **Dead code:** safe to delete.
  - Files: `frontend/src/App.css`, `src/assets/{hero.png,react.svg,vite.svg}`.
  - Unused components: `components/feed/{PostActions,LikeButton,CommentButton,MoreButton,PostHeader}.jsx`,
    `context/FeedActions*`, `hooks/useFeedActions.js`.
  - Leftovers: the empty `backend/uploads/` directory and the unused
    `messages_dm_legacy` table.
- ⚠️ **No error monitoring:** no Sentry or similar, and no request logging
  in production.

**Tests**

| Suite | Count | Result | Runs in CI? |
| --- | --- | --- | --- |
| Backend API (Jest + Supertest, real PostgreSQL) | 26 files, 233 tests | 233/233 ✅ | Yes (`ci.yml`, but CI has never run because `dev` isn't pushed) |
| Browser suites (`e2e/`, headless Edge) | 19 suites, 281 checks + the A3 matrix (222 × 3 languages) | 281/281 ✅ | No: Windows-only scripts, run by hand |
| i18n check (`npm run check:i18n`) | 763 keys × 3 languages, plural forms, server-message parity | ✅ | Yes |
| Frontend unit tests | 0 | — | — |

**Coverage gaps:**
- Rate limiting (disabled under test, which is how #1 slipped through).
- Real email delivery.
- Real Cloudinary uploads.
- Load and concurrency.
- Multi-instance sockets.
- Frontend unit tests.
- Browser suites in CI.

---

## 6. Gap analysis vs. a full Facebook/Instagram-style app

**Already done (on `dev`):**
- comment replies and threads;
- 6 reactions;
- multi-image posts;
- stories;
- per-post privacy;
- groups;
- pages;
- notification settings;
- admin/moderation tools;
- EN/MY/AR with RTL;
- CI (built);
- automated API and browser tests;
- group chat;
- DM edit, reply and photos;
- explore/trending;
- people you may know;
- PWA.

**Hours** are rough Claude Code estimates. **Free tier** means whether it
runs on Render/Neon/Vercel free plans. ⚠️ marks items that need a new
free account or have limits.

### P0 — before a public launch or a live demo

| Gap | Hours | Depends on | Free tier |
| --- | --- | --- | --- |
| Push `dev` (backup) | 0.1 (owner) | — | ✅ |
| Fix the proxy rate limit (#1) + a test outside test mode | 1 | — | ✅ |
| Own posts in the Home feed (#3) | 1–2 | — | ✅ |
| Production email via an HTTP API (reset and verification) + stop logging tokens (#4) | 2–3 | Owner creates a Brevo or Resend account | ⚠️ Free tiers (Brevo 300/day, Resend 3k/month) |
| Delete Cloudinary media on delete (#5) | 3–4 | — | ✅ (saves quota) |
| Env validation at startup + `PORT` (#7) | 0.5 | — | ✅ |
| Deploy: backup → migrations 015–027 → deploy → merge; CI and keep-alive then start | 2 (owner-guided) | Push | ✅ |

### P1 — production hardening and expected features

| Gap | Hours | Depends on | Free tier |
| --- | --- | --- | --- |
| Session control: token revocation, "log out all devices", active sessions list (#6) | 5–6 | — | ✅ |
| Web push notifications (VAPID) | 6–8 | PWA (done) | ✅ |
| Error monitoring (e.g. Sentry) + request logging | 2–3 | Owner creates an account | ⚠️ Free plan |
| Signup spam protection (CAPTCHA, e.g. Cloudflare Turnstile) | 2 | #1 | ⚠️ Free account |
| Report comments, messages, groups and pages (#9) | 3 | — | ✅ |
| Cleanup jobs: expired stories, old notifications (#8) | 2 | — | ✅ |
| Link previews (server-side OG fetch, SSRF-safe; #11) | 5–6 | — | ✅ |
| SEO/share cards: OG meta for public posts, pages and profiles (SPA → meta endpoint or prerender) | 4–6 | — | ✅ |
| Data export (download my data) | 3–4 | — | ✅ |
| 2FA (TOTP) + backup codes (account recovery without email) | 6–8 | Session control | ✅ |
| Content filtering: profanity lists (EN/MY/AR), spam heuristics | 3–4 | — | ✅ (image moderation add-ons are paid) |
| Accessibility audit (axe) + fixes; user alt text for images | 4–6 | — | ✅ |
| Frontend security headers (#12) | 0.5 | — | ✅ |
| Browser suites in CI (port the scripts to Linux) | 4–6 | Push | ✅ (Actions minutes) |
| Self-host fonts | 1 | — | ✅ |
| Backups and staging: Neon branch for staging, documented restore | 2 (owner) | — | ⚠️ Neon free restore window is short |

### P2 — later

| Gap | Hours | Depends on | Free tier |
| --- | --- | --- | --- |
| Friend requests (mutual "friends" as well as follow) | 6–8 | — | ✅ |
| Events (create, RSVP, reminders) | 10–12 | Push notifications for reminders | ✅ |
| Polls, drafts/scheduled posts, archive, location tags | 2–4 each | — | ✅ |
| Mute users/keywords, close friends, hashtag follow | 2–4 each | — | ✅ |
| Message reactions, message search, pinned messages | 2–4 each | — | ✅ |
| Saved collections, share to DM | 2–3 each | — | ✅ |
| Verified badges (a real verification process; the UI tick already exists) | 3 + a process | — | ✅ |
| Settings placeholders (Content Preferences, Story Settings, Help & Support) | 1–3 each | — | ✅ |
| Frontend unit tests (hooks, utils) | 6 | — | ✅ |
| Dead-code cleanup | 1 | — | ✅ |
| Horizontal scaling (Socket.io Redis adapter, shared rate-limit store) | 4–6 | Paid infrastructure | ❌ Needs paid Redis/instances |

### PAUSED — listed, not planned

- Short video (reels);
- long video;
- voice/video calls;
- random video chat;
- live streaming.

The Settings rows and landing copy already present these as coming later.

---

## 7. Recommended order of work

1. **Today:** push `dev` to GitHub (backup), then open a PR `dev` →
   `master` so CI runs.
2. **Critical fixes:** the proxy rate limit (#1), own posts in the feed
   (#3), env validation and `PORT` (#7), plus a rate-limit test outside
   test mode.
3. **Privacy-critical:** delete Cloudinary media on delete (#5), and align
   the Privacy Policy text.
4. **Email:** an HTTP email provider for reset and verification (#4), and
   stop logging tokens.
5. **Go live:**
   - back up Neon;
   - run migrations 015 → 027;
   - deploy the backend and frontend;
   - run `make-admin.js`;
   - merge to `master`;
   - check that CI and keep-alive pass.
6. **Hardening:** session revocation (#6), cleanup jobs (#8), reportable
   comments and messages (#9), frontend security headers (#12), error
   monitoring, CAPTCHA.
7. **Engagement:** web push notifications, link previews, and
   SEO/share cards.
8. **Trust and compliance:** 2FA with backup codes, data export, and an
   accessibility pass.
9. **Before public launch:** a legal review of `/terms` and `/privacy`,
   and native-speaker reviews of Myanmar and Arabic.
10. **P2 features** as the product needs them; video and call features
    stay paused.
