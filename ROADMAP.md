# MySocialApp Roadmap

Status legend: ⬜ NOT CHECKED · 🟡 PARTIAL · ✅ VERIFIED

**Current status (2026-09-24):** Phase 1 history is fully verified. Phase 2
(real email) is code-complete but not yet configured/tested with a real
Gmail App Password — that's the next thing to close out before starting
Section A.

This file supersedes the ad-hoc "Phase 1 / Phase 2 / ..." numbering used
earlier in chat — those are preserved below as history under their own
heading. Going forward, work is tracked as Section A / B / C items below.

---

## HISTORY (pre-existing phases, kept for record)

### Phase 1 — Demo-breaking bug fixes
**Status:** ✅ VERIFIED (2026-09-23)
**Done when:** search reachable from the UI, notification badge reflects
real unread count, Menu screen shows the real logged-in user, no fake
Stories data shown, dead `/uploads` route/files removed.
**Notes:**
- 1.1 Search entry point wired — `TopAppBar.jsx` search icon now
  navigates to `/search`.
- 1.2 Real notification badge — `TopAppBar.jsx` + `SettingsScreen.jsx`
  now use the real `useUnreadCount` hook instead of a hardcoded `3`.
- 1.3 Menu screen shows real user — `MenuScreen.jsx` fetches
  `GET /profile/me` instead of importing `mockCurrentUser`;
  `ProfileSummaryRow.jsx` extended to accept a real `src` avatar.
  (`SettingsScreen.jsx` still has the same mock-user pattern at its own
  profile row — flagged, not yet fixed, folded into A3 below.)
- 1.4 Fake StoriesRow removed — `HomeFeed.jsx` no longer renders
  `MOCK_STORIES`; `StoriesRow.jsx` component itself left intact,
  ready for B3 (real Stories) to wire back in.
- 1.5 Dead `/uploads` cleanup — confirmed zero DB rows reference legacy
  `/uploads/...` paths before removing; `server.js` static route + the
  2 orphaned files deleted.

### Phase 2 — Real email delivery
**Status:** 🟡 PARTIAL (code complete 2026-09-23, not yet configured/tested)
**Done when:** Gmail App Password set in real `backend/.env`, a real
signup-verification email and a real password-reset email both received
and successfully completed end-to-end.
**Notes:**
- `backend/utils/email.js` rewritten to use Nodemailer over generic SMTP
  env vars (`EMAIL_HOST/PORT/USER/PASS/FROM`); falls back to the original
  console.log behavior if those aren't set, never throws on send failure.
- `backend/controllers/authController.js`: hardcoded `localhost:5173`
  links replaced with `FRONTEND_URL` env var (needed for links to work
  against a deployed frontend, not just local dev).
- `nodemailer` added to `backend/package.json`; `.env.example` documents
  the new vars and the Gmail App Password setup steps.
- **Still open:** user hasn't set up the Gmail App Password or run the
  real-email test yet. Do this before starting Section A.

---

## SECTION A — Foundation

### A1 — Automated API tests
**Status:** ✅ VERIFIED (2026-09-24)
**Done when:** Jest + Supertest installed in `backend/`; test coverage
exists for auth, profile, post, feed, like, comment, follow/private,
block, DM, search, bookmarks — happy path plus the key negative cases
(ownership rejection, block enforcement, private-account gating);
`npm test` runs and passes locally.
**Notes:**
- 80/80 tests passing across 10 files (`backend/tests/api/`), ~25s,
  exits cleanly on its own (no `--forceExit`, no open handles).
- Runs against a real, isolated throwaway Postgres 17 cluster
  (`tests/.pgdata_test_cluster`, port 55433, trust auth, gitignored),
  auto-started by `tests/globalSetup.js` and stopped by
  `globalTeardown.js`. Replaced an earlier pg-mem attempt, which can't
  run correlated subqueries / LATERAL / row-value comparisons — the
  codebase's core block/privacy query patterns.
- Hang fix (2026-09-24): `npm test` hung forever in globalSetup on
  Windows because (1) `pg_ctl start` was run via `execFileSync` with
  piped stdio, which postgres.exe inherits so EOF never arrives — fixed
  with `stdio: 'ignore'`; (2) the server log lived inside the data dir,
  causing a "sharing violation" during recovery fsync — moved to
  `tests/.pgdata_test_cluster.log`.
- The 2 DM tests previously `it.skip`'d for pg-mem gaps (message history,
  conversation-list unread count) are re-enabled and pass; the delete-
  message test now also checks scrubbing via the history endpoint.
- Each test file closes its pg Pool in `afterAll`; rate limiters are
  no-ops under `NODE_ENV=test`; `server.js` only listens / inits
  Socket.io when run directly, so Supertest can import `app`.

### A2 — Reliability
**Status:** ⬜ NOT CHECKED
**Done when:** every data-fetching screen has consistent loading/empty/
error states (Notifications and Messages currently lack some of these
per the 2026-09-23 audit); Socket.io client reconnects cleanly after a
network drop (test via devtools offline toggle); no unhandled promise
rejections or console errors during a normal end-to-end walkthrough.
**Notes:** _(none yet)_

### A3 — Visual consistency
**Status:** ⬜ NOT CHECKED
**Done when:** Login, Signup, ForgotPassword, ResetPassword, CreatePost,
EditProfile, Notifications, Messages, Conversation, Search are all
restyled into the PhoneShell/design-token system (currently old raw
inline-style pages sitting next to the polished rebrand screens);
`SettingsScreen.jsx`'s own mock-user profile row fixed the same way
`MenuScreen.jsx` was in Phase 1; dark mode verified correct on every
screen, not just the newer ones; tested at common mobile widths
(375/390/430px) with no horizontal scroll or clipping.
**Notes:** _(none yet)_

### A4 — GitHub Actions CI
**Status:** ⬜ NOT CHECKED
**Done when:** a workflow in `.github/workflows/` runs the test suite
(from A1) on every push/PR to `main`; pass/fail status visible on GitHub.
**Notes:** _(none yet — depends on A1 existing first)_

### A5 — Keep-alive cron
**Status:** ⬜ NOT CHECKED
**Done when:** a scheduled GitHub Actions workflow pings a lightweight
endpoint (e.g. `GET /`) on the deployed Render backend frequently enough
to prevent free-tier cold-start spin-down; verified by checking response
time stays low even after a long idle gap.
**Notes:** depends on clarifying current Render deploy status first.

### A6 — Security & performance audit
**Status:** ⬜ NOT CHECKED
**Done when:** every route re-checked for an auth/ownership check where
needed (backend audit on 2026-09-23 found no missing checks, but this is
a formal re-pass); no N+1 query patterns in feed/comments/notifications;
DB indexes reviewed against actual query patterns (migrations 001/002
already added several trigram/perf indexes — confirm still sufficient);
frontend production bundle size reviewed for accidental bloat (same class
of issue already caught once in `MenuScreen.jsx`'s icon-import choice).
**Notes:** _(none yet)_

---

## SECTION B — Social features (Facebook/Instagram level)

### B1 — Reactions (like, love, haha, wow, sad, angry)
**Status:** ⬜ NOT CHECKED
**Done when:** likes extended with a reaction type (new column or new
table), API supports setting/changing a reaction, frontend reaction
picker UI, existing plain "like" data stays compatible/migrated.
**Notes:** _(none yet)_

### B2 — Multiple images per post (carousel)
**Status:** ⬜ NOT CHECKED
**Done when:** a `post_media`-style join table replaces the current
single `image_url` column on `posts`; upload UI supports multi-select;
feed and post-detail render a swipeable carousel.
**Notes:** current schema is single-image-per-post (confirmed 2026-09-23).

### B3 — Stories: real backend + UI, auto-expire 24h
**Status:** ⬜ NOT CHECKED
**Done when:** a `stories` table with `expires_at`, an upload endpoint,
expiry enforced (query-time filter or cron cleanup), and `StoriesRow.jsx`
(left intact in Phase 1 specifically for this) wired to the real data
instead of removed entirely.
**Notes:** _(none yet)_

### B4 — Comment replies (nested) + comment likes
**Status:** ⬜ NOT CHECKED
**Done when:** `comments.parent_comment_id` added (schema is currently
flat, confirmed 2026-09-23), threaded reply UI, `comment_likes` table +
like button on comments.
**Notes:** _(none yet)_

### B5 — Post privacy: Public / Followers only
**Status:** ⬜ NOT CHECKED
**Done when:** a `posts.visibility` column exists and every feed/profile
query respects it in addition to the existing account-level
private-account gating.
**Notes:** _(none yet)_

### B6 — Profile tabs: Posts / Photos / Saved / Tagged
**Status:** ⬜ NOT CHECKED
**Done when:** `ProfileScreen.jsx` has tabbed navigation, each tab backed
by a real filtered query. "Tagged" needs a scope decision (tagging people
in a post/photo isn't the same as an @mention in text — currently only
text mentions exist).
**Notes:** _(none yet)_

### B7 — Explore page: trending hashtags, popular posts
**Status:** ⬜ NOT CHECKED
**Done when:** a ranking query (e.g. engagement over a recent time
window) backs a new `/explore` endpoint and screen.
**Notes:** _(none yet)_

### B8 — People you may know (follow suggestions)
**Status:** ⬜ NOT CHECKED
**Done when:** a suggestion query (mutual follows / shared network) backs
an endpoint, surfaced in a real UI slot (e.g. on Explore or Search).
**Notes:** _(none yet)_

### B9 — DM extras: edit/delete message, reply-to, send images
**Status:** ⬜ NOT CHECKED
**Done when:** each sub-feature has DB + API support and UI controls in
`Conversation.jsx`. Note: soft-delete for messages already exists
(confirmed 2026-09-23) — verify what's reusable before building delete
again; edit and reply-to are net-new.
**Notes:** _(none yet)_

### B10 — Group chat
**Status:** ⬜ NOT CHECKED
**Done when:** conversations reliably support more than 2 participants,
plus group-specific UI (name, member list, add/remove member).
**Notes:** the existing `conversation_participants` join-table design
(confirmed via FK audit 2026-09-23) may already be structurally
multi-participant-capable — verify before assuming new schema work is
needed here.

### B11 — Notification settings (choose which to receive)
**Status:** ⬜ NOT CHECKED
**Done when:** a per-user preferences table/column exists, notification-
creation code checks it before inserting each notification type, and a
Settings UI toggle controls it (row already exists as a stub —
`SettingsScreen.jsx`'s "Content Preferences"/notifications area).
**Notes:** _(none yet)_

### B12 — Admin panel: review reports, ban users, remove posts
**Status:** ⬜ NOT CHECKED
**Done when:** an admin-only route group + role/flag on `users` exists;
a UI (can be minimal) lists the `reports` table (already populated by
real user reports since the 12-feature batch, currently reviewed by
nobody — confirmed 2026-09-23) and supports acting on them (dismiss,
remove content, ban).
**Notes:** _(none yet)_

### B13 — Groups (create, join, post inside, admins)
**Status:** ⬜ NOT CHECKED
**Done when:** `groups`/`group_members` tables exist, posts can be scoped
to a group, group-admin permissions enforced.
**Notes:** _(none yet)_

### B14 — Pages (business/creator pages, follow pages)
**Status:** ⬜ NOT CHECKED
**Done when:** a page entity distinct from a user account exists, a
follow-a-page flow, and page-authored posts.
**Notes:** _(none yet)_

### B15 — Myanmar / English language switch (i18n)
**Status:** ⬜ NOT CHECKED
**Done when:** an i18n library is wired into the frontend, all
user-facing strings are extracted (currently all hardcoded English), and
a language toggle in Settings persists the choice.
**Notes:** _(none yet)_

---

## SECTION C — Investor prep

### C1 — Demo seed script
**Status:** ⬜ NOT CHECKED
**Done when:** a single command (e.g. `npm run seed`) populates a local
dev database with realistic users, posts, comments, follows, and DMs;
clearly separated from the real migration scripts; safe to re-run.
**Notes:** local DB only, per your scope note.

### C2 — Privacy Policy + Terms pages (draft)
**Status:** ⬜ NOT CHECKED
**Done when:** two real routes/screens exist with actual (simple/
template is fine) legal text, linked from the existing disabled stub
rows in `SettingsScreen.jsx` ("Terms & Conditions", "Privacy Policy" —
confirmed present but non-functional as of 2026-09-23).
**Notes:** _(none yet)_

### C3 — Landing page explaining the app
**Status:** ⬜ NOT CHECKED
**Done when:** a public marketing/explainer page exists, separate from
the logged-in app shell, for someone who isn't a user yet.
**Notes:** _(none yet)_

### C4 — Final end-to-end audit of every feature + report
**Status:** ⬜ NOT CHECKED
**Done when:** every item in this roadmap re-verified against the actual
running app in one pass, with a written pass/fail report per item.
**Notes:** this is the gate before investor demo — do last.

---

## NEEDS OWNER (Claude must skip these — require your own account/action)

- Email via Brevo API — needs a Brevo account + API key; Render blocks
  outbound SMTP on its free tier, so Gmail SMTP (Phase 2) only works for
  local dev, not the deployed backend.
- Web push notifications — needs VAPID/push env keys configured on Render.
- Voice/Video calls — needs two-device testing, can't be verified solo.
- Short/Long video — Cloudinary free-tier credits risk; needs a budget
  decision before building.
- Real multi-user testing, deployment verification — needs you actually
  doing it, not something to automate away.
- Merging dev into main — a deliberate action only you should trigger.
