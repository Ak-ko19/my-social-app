# MySocialApp — Detailed Step-by-Step Guide

This file has the detailed sub-steps for every remaining task. Use this when
you (or any AI assistant) need to know exactly HOW to do a task, not just
WHAT the task is. Keep this file for yourself — paste relevant sections into
any AI assistant (Claude Code, ChatGPT, etc.) when you need help.

Project: Node.js + Express (backend), React + Vite (frontend), PostgreSQL
Location: C:\MyProjects\Mysocialapp

---

## TASK 1: Input Validation (email format + empty fields)

**Goal:** Reject bad signup/login input with clear error messages, both on
the backend (source of truth) and frontend (better user experience).

### Backend steps
1. Open `backend/routes` (or wherever signup/login route handlers live).
2. At the top of the signup handler, before touching the database, check:
   - `username`, `email`, `password` are all present and non-empty (trim whitespace first)
   - `email` matches a valid email pattern (regex or a package like `validator`)
   - `password` meets a minimum length (e.g. 6+ characters)
3. If any check fails, return `400` with a clear JSON message, e.g.
   `{ error: "Please enter a valid email address" }`
4. Do the same for the login handler (empty email/password check).
5. Optional: install the `validator` npm package (`npm install validator`)
   instead of writing your own regex — more reliable.

### Frontend steps
1. In `Signup.jsx` and `Login.jsx`, add local state for error messages
   (e.g. `const [error, setError] = useState("")`).
2. Before calling the API (`onSubmit`), check the same rules client-side:
   empty fields, valid email format.
3. If invalid, set the error state and stop — don't call the API.
4. Display the error message near the form (e.g. red text above the submit button).
5. Also handle backend validation errors: if the API call itself returns a
   400 with an error message, display that message too (backend is the
   final safety net even if frontend validation is bypassed).

### Test checklist
- Empty username/email/password → clear error, no crash
- Invalid email (e.g. "notanemail") → rejected
- Valid input → succeeds as before

---

## TASK 2: Forgot Password

**Goal:** Let a user reset their password via email link (simplified version
without a real email service is OK for MVP — can log the reset link to the
console/terminal instead of actually emailing it, for now).

### Backend steps
1. Add a `reset_token` and `reset_token_expiry` column to the `users` table
   (via pgAdmin Query Tool):
   ```sql
   ALTER TABLE users ADD COLUMN reset_token TEXT;
   ALTER TABLE users ADD COLUMN reset_token_expiry TIMESTAMP;
   ```
2. Create `POST /forgot-password` route:
   - Accept `email` in the request body
   - Look up the user by email; if not found, still return a generic success
     message (don't reveal whether the email exists — security best practice)
   - If found, generate a random token (e.g. using Node's built-in `crypto.randomBytes(32).toString("hex")`)
   - Save the token and an expiry (e.g. now + 1 hour) to the user's row
   - For now (no email service yet): log the reset link to the terminal,
     e.g. `console.log(\`Reset link: http://localhost:5173/reset-password/\${token}\`)`
3. Create `POST /reset-password/:token` route:
   - Look up the user by `reset_token`, check the token hasn't expired
   - If valid, hash the new password and update the user's row
   - Clear the `reset_token` and `reset_token_expiry` fields after use
   - Return success or a clear error ("Link expired or invalid")

### Frontend steps
1. Create `ForgotPassword.jsx` — a form with just an email field, calls
   `POST /forgot-password`, shows a generic "If that email exists, a reset
   link has been sent" message.
2. Create `ResetPassword.jsx` — reads the `:token` from the URL
   (`useParams` from react-router-dom), shows a new-password field, calls
   `POST /reset-password/:token`.
3. Add routes for both pages in `App.jsx`.
4. Add a "Forgot password?" link on the Login page.

### Test checklist
- Request reset for existing email → token generated, link logged to terminal
- Request reset for non-existent email → same generic success message (no leak)
- Use the link within time limit → password changes successfully
- Use an expired or already-used token → clear error, no crash

### Later upgrade (once you have a domain/funding)
Replace the console.log with a real email service (e.g. Nodemailer + Gmail
SMTP, or SendGrid) to actually deliver the reset link by email.

---

## TASK 3: Comment Edit

**Goal:** Let a user edit their own comments (like the existing post edit feature).

### Backend steps
1. Add `PUT /comments/:id` route:
   - Verify the requester is logged in (use existing `authMiddleware`)
   - Look up the comment by `id`
   - Check `comment.user_id === req.user.id` (owner-check, same pattern as post edit)
   - If not the owner, return `403 Forbidden`
   - If owner, update the `content` field with the new text, return the updated comment
2. Reuse the same owner-check pattern you already built for post edit/delete.

### Frontend steps
1. In `Feed.jsx`, next to each comment (only your own), add an "Edit" button.
2. On click, turn that comment into an editable text input (pre-filled with
   current text) with Save/Cancel buttons.
3. On Save, call `PUT /comments/:id` with the new text, then update the
   comment in local state so the UI reflects the change immediately.

### Test checklist
- Edit your own comment → saves and displays new text
- Try editing someone else's comment (via API directly, e.g. Thunder Client) → 403 error
- Empty comment text on save → rejected with clear error

---

## TASK 4 (Optional): Refactor Backend into Folders

**Goal:** Move from one big `server.js` into a clean, maintainable structure.

### Target structure
```
backend/
  routes/       → route definitions (e.g. authRoutes.js, postRoutes.js)
  controllers/  → the actual handler logic for each route
  middleware/   → authMiddleware.js, error handlers
  models/       → database query functions (optional, or keep in controllers)
  db.js         → existing database connection
  server.js     → just sets up Express app and mounts routes
```

### Steps
1. Do this refactor ONLY after all features above are built and tested —
   refactoring while still adding features risks breaking things twice.
2. Move one route group at a time (e.g. auth routes first), test after each move.
3. Example: `routes/authRoutes.js` defines `router.post("/signup", signupController)`;
   `controllers/authController.js` has the actual `signupController` function.
4. Update `server.js` to just do `app.use("/", authRoutes)` etc.
5. Re-run your full edge-case test suite after the refactor to confirm nothing broke.

---

## TASK 5: .env Setup (move secrets out of source code)

*(Covered in detail in the previous message — repeated here for completeness)*

1. Create a `.env` file in `backend/` with:
   ```
   DB_PASSWORD=your_actual_password
   JWT_SECRET=your_actual_secret
   ```
2. Add `.env` to `.gitignore` (create this file in `backend/` if it doesn't exist):
   ```
   node_modules/
   .env
   ```
3. Install dotenv: `npm install dotenv`
4. At the very top of `server.js`, add: `require("dotenv").config();`
5. In `db.js`, replace the hardcoded password with `process.env.DB_PASSWORD`
6. Wherever `JWT_SECRET` is hardcoded, replace with `process.env.JWT_SECRET`
7. Optional: create `.env.example` with the same variable names but placeholder
   values (e.g. `DB_PASSWORD=yourpasswordhere`) — safe to upload to GitHub,
   helps anyone else set up the project.
8. Restart the backend server and re-test login/signup to confirm `.env`
   values are loading correctly (no crash, no "undefined" errors).

**Do this BEFORE any GitHub upload — this is a hard requirement, not optional.**

---

## TASK 6: Deploy (final step)

Not detailed yet — this comes only after everything above is complete. When
you're ready, ask for a detailed deploy guide (covers choosing a host for
backend + database + frontend, e.g. Render/Railway + Vercel/Netlify, plus
environment variable setup on the hosting platform).

---

## Production-Readiness Audit & Hardening (2026-09-16)

**Goal:** Before deploying, a full review of Security, Code Quality, and
Database Performance was run across the whole codebase (all backend
controllers/routes/middleware, the frontend API layer, and the live
PostgreSQL schema/indexes). Every Critical, High, Medium, and Low finding
was fixed and individually verified against the running app + real
database — not just reviewed on paper. This section is the permanent record
of what was found and what was done about it, so any AI assistant (or you)
can see the current security/perf posture without re-auditing from scratch.

### 🔴 Critical (all fixed)

1. **Public PII exposure** — `GET /profile/:id` and the followers/following
   endpoints returned every user's email address to anyone, unauthenticated.
   **Fix:** those endpoints no longer select `email`; only `GET /profile/me`
   (the owner's own profile) returns it.
   Files: `backend/controllers/profileController.js`, `followController.js`.

2. **Missing database indexes** — core query paths (feed, comments,
   messages, notifications, followers, password-reset lookup) had no
   supporting indexes beyond primary keys, forcing full table scans that
   get worse as the app grows. **Fix:** `backend/migrations/001_add_performance_indexes.sql`
   adds 11 indexes (`CREATE INDEX CONCURRENTLY`, safe for a live DB) across
   `posts`, `comments`, `messages`, `notifications`, `follows`, `users`,
   including two that speed up the `ON DELETE CASCADE` paths on
   `notifications`. Verified via `EXPLAIN` that every target query is
   structurally able to use its new index.

3. **Frontend hardcoded `http://localhost:3000` in ~30 places** — the app
   could not be pointed at any deployed backend. **Fix:** added
   `frontend/src/api.js`, a single axios instance reading
   `VITE_API_URL` (falls back to localhost for dev); every API call and
   image URL across all 11 page components now goes through it. Set
   `VITE_API_URL` in the hosting platform's env config at deploy time.

### 🟠 High (all fixed)

4. **No rate limiting on auth endpoints** — brute force / credential
   stuffing was unrestricted. **Fix:** `backend/middleware/rateLimiter.js`
   (`express-rate-limit`): login 5 *failed* attempts/15min (successes don't
   count, so legitimate users are never locked out by their own history),
   signup 10/hour, forgot-password 5/15min, reset-password 10/15min.

5. **Login user enumeration** — "User not found" vs "Incorrect password"
   let an attacker discover which emails have accounts. **Fix:** both cases
   now return the same `401 "Invalid email or password"`, and `bcrypt.compare`
   always runs (against a dummy hash for non-existent users) so response
   timing doesn't leak it either. `backend/controllers/authController.js`.

6. **Upload extension/content spoofing** — the stored file extension came
   from the client-supplied filename, and only the (spoofable)
   `Content-Type` header was checked. An attacker could upload
   `x.html` claiming `image/png` and get it served back as executable
   HTML — stored XSS. **Fix:** `backend/middleware/upload.js` now derives
   the extension only from a fixed MIME allowlist (never the client
   filename), and verifies the actual file bytes (magic-byte signature)
   match the claimed type, deleting anything that doesn't match.

7. **Plaintext password-reset tokens** — a DB leak would hand out usable
   reset tokens directly. **Fix:** tokens are SHA-256 hashed before
   storage (the same principle as never storing plaintext passwords); the
   plaintext token is still what's emailed/logged, only the DB copy is
   hashed. `backend/controllers/authController.js`.

### 🟡 Medium (all fixed, 2 decisions explicitly deferred by the user)

8. **Missing security headers** — added `helmet()` in `server.js`, with an
   explicit `crossOriginResourcePolicy: 'cross-origin'` override so it
   doesn't break `/uploads` images being loaded from the frontend's
   different origin.

9. **CORS wide open** — restricted to an `ALLOWED_ORIGINS` env var
   (comma-separated, defaults to `http://localhost:5173`). Set this to your
   real frontend domain(s) at deploy time.

10. **Internal error messages leaked to clients** — every controller's
    `catch` block sent raw `err.message` (Postgres error text, schema
    details) back to the client. **Fix:** `backend/utils/sendError.js`
    logs the full error server-side and sends a generic message to the
    client; applied across all 9 controllers (33 call sites).

11. **No upper bound on `?limit=`** — a client could request
    `?limit=999999`. **Fix:** `backend/utils/pagination.js`, a shared
    `getPagination()` helper (clamps limit to a per-endpoint max, clamps
    negative/invalid page to 1), applied to `getPosts`, `getFeed`,
    `getConversation`, `getNotifications`, `searchPosts`.

12. **`getPosts` ran a full `COUNT(*)` on every request** — gets slower as
    the table grows, and nothing in the frontend used the total-count
    fields. **Fix:** fetches `limit + 1` rows and returns a `hasMore` flag
    instead of `totalPages`/`totalPosts` — no COUNT query at all.

13. **`ILIKE '%q%'` search couldn't use an index** (leading wildcard).
    **Fix:** `backend/migrations/002_add_trigram_search_indexes.sql` adds
    the `pg_trgm` extension and GIN trigram indexes on `users.username` and
    `posts.content`. Verified via `EXPLAIN` that both search queries now
    use `Bitmap Index Scan` on the trigram index.

14. **JWT stored in `localStorage`** — *decision, not a bug fix.* Switching
    to httpOnly cookies would need CSRF middleware and doesn't carry over
    cleanly to the React Native app planned for later (bearer tokens do).
    **Decided: leave as-is** — the XSS surface that made this risky is
    smaller now (upload content is validated, no `dangerouslySetInnerHTML`
    anywhere). Revisit if the app's XSS attack surface grows.

15. **FK `ON DELETE NO ACTION`** from `posts`/`comments`/`messages`/
    `notifications` to `users` — no delete-account feature exists yet, so
    there's nothing to break today, but the cascade/anonymize/restrict
    policy needs a real product decision before that feature is built.
    **Decided: deferred** until account deletion is actually planned —
    don't assume CASCADE by default when that day comes.

### 🟢 Low (all fixed)

16. **`create-test-user.js`** had hardcoded test credentials in the backend
    root. **Fix:** moved to `backend/scripts/create-test-user.js` and added
    a guard that refuses to run when `NODE_ENV=production`.

17. **Password policy was 6-char minimum only.** **Fix:** bumped to
    NIST 800-63B guidance — 8-char minimum, no forced complexity rules
    (those push people toward predictable patterns), and a 72-char maximum
    (bcrypt silently truncates and ignores anything past 72 bytes, so a
    longer password would appear accepted while not actually mattering).
    Applied in both `authController.js` and the matching frontend checks in
    `Signup.jsx`/`ResetPassword.jsx`.

18. **`db.js` hardcoded `user`/`database`** — only the password was
    externalized. **Fix:** `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PORT` are
    now all read from env vars (with the same defaults as before, so local
    dev is unaffected).

19. **No root-level `.gitignore`** — added one covering OS files, editor
    configs, and a root `.env`.

### New files this audit added
```
backend/migrations/001_add_performance_indexes.sql
backend/migrations/002_add_trigram_search_indexes.sql
backend/middleware/rateLimiter.js
backend/utils/sendError.js
backend/utils/pagination.js
backend/scripts/create-test-user.js   (moved from backend root)
frontend/src/api.js
.gitignore                            (repo root)
```

### New environment variables (see `backend/.env.example` / `frontend/.env.example`)
- `ALLOWED_ORIGINS` — comma-separated list of origins allowed to call the API
- `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PORT` — now all overridable (password already was)
- `VITE_API_URL` (frontend) — the backend's base URL; **must be set to the real backend URL at deploy time**, or the frontend will try to call `localhost:3000`

### Applying the new migrations on another environment (e.g. staging/prod)
The two SQL files in `backend/migrations/` were written to be run directly
against Postgres (`CREATE INDEX CONCURRENTLY`, safe on a live DB with
traffic). Run them in order with `psql` or any Postgres client:
```
psql -U postgres -d social_app_db -f backend/migrations/001_add_performance_indexes.sql
psql -U postgres -d social_app_db -f backend/migrations/002_add_trigram_search_indexes.sql
```

### Still open before public launch (not part of this audit's scope)
- Deploy step itself (TASK 6 above) — still not started.
- Real email delivery for password reset (currently logs the link to the
  console — see TASK 2's "Later upgrade" note).
- The two deferred Medium decisions above (JWT storage location, FK cascade
  policy) once their triggering conditions are actually met.

---

## 12-Feature Production Batch (2026-09-22)

**Goal:** Block/report/bookmark/edit-delete/share/hashtags/mentions/
privacy/account-management/email-verification/rate-limiting/PWA, built as
full vertical slices (migration → backend → frontend → tested), one at a
time, in the order below. Every feature was smoke-tested against the real
DB via curl and clicked through in a real Chrome tab (not just unit-level
reasoning) before moving to the next.

### New migrations (006–014)
```
006_add_blocks                       -- blocks table (bidirectional check in blockService)
007_fix_comments_post_cascade        -- bug fix: comments.post_id was NO ACTION, blocking DELETE /posts/:id whenever a post had comments
008_add_reports                      -- reports table (polymorphic target_type/target_id)
009_add_bookmarks                    -- bookmarks table
010_add_hashtags                     -- hashtags + post_hashtags join tables
011_add_privacy                      -- users.is_private, follows.status ('accepted'|'pending')
012_add_account_status               -- users.is_deactivated, deactivated_at
013_cascade_account_delete           -- posts/comments/notifications/messages FKs -> ON DELETE CASCADE (see account-deletion-fk-policy decision below)
014_add_email_verification           -- users.email_verified, verification_token, verification_token_expiry
```
Apply with `node backend/scripts/run-migration.js backend/migrations/<file>.up.sql`,
in numeric order. Two things worth knowing before running these against a
different environment:
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, and
  `run-migration.js` sends a whole file as one query (which node-postgres
  wraps in an implicit transaction when it contains multiple statements) —
  001/002's CONCURRENTLY indexes only work via `psql -f` (statement-by-
  statement), not this script. 014 deliberately uses a plain `CREATE INDEX`
  instead, inside `BEGIN/COMMIT`, for exactly this reason.
- 013's decision (cascade, not anonymize) was explicitly deferred back on
  2026-09-16 and resolved during this batch — see the `account-deletion-
  fk-policy` memory for the full reasoning.

### 1. Block user
`blocks` table + `blockService.isBlocked` (bidirectional) used everywhere a
block needs to gate something: `followController` (can't follow), 
`messageService.assertNotBlocked` (can't message, re-checked on every send
so a block placed mid-conversation takes effect immediately), and a
`NOT EXISTS` clause repeated in every feed/search/hashtag/bookmark query
(mutual invisibility — same pattern as the codebase's existing per-query
style, not centralized into one shared SQL fragment). Frontend: `PostMenu`
(post card "…" menu) + `ConfirmDialog`/`ActionSheet`/`Modal` (new
`components/ui` primitives every later feature reuses) + Settings →
Blocked Users.

### 2. Report post/user
`reports` table (allowlisted `reason`, free-text `details`, `status`
pending/reviewed — no admin dashboard, per spec). Rate-limited
(`reportLimiter`, 15/hour). Frontend: `ReportDialog` (reason radio list),
reachable from `PostMenu` for both "Report post" and "Report {username}".

### 3. Bookmark/Save
`bookmarks` table, same shape/pattern as `likes`. `bookmarked_by_me` added
to every post-list query. Frontend: `useBookmarkToggle` (mirrors
`useLikeToggle`'s optimistic-update shape exactly), a Save button on the
post card, and a Saved Posts screen (`/saved`, linked from the hamburger
menu) reusing `FeedList`.

### 4. Post edit/delete UI
Backend already existed; only the frontend was missing, plus **the comments
cascade bug (migration 007)** discovered while testing it — `DELETE
/posts/:id` was silently broken for any post with a comment before this
batch. `PostMenu` gained Edit/Delete for the post's own author; edit is
inline (textarea replacing the post body, not a modal).

### 5. Share + post detail page
`GET /posts/:id` extended with `like_count`/`comment_count`/
`liked_by_me`/`bookmarked_by_me`, and made reachable at `/posts/:id` — the
first fully public page in the app (works logged out, via `optionalAuth`).
Share uses `navigator.share` where available, clipboard-copy fallback
otherwise.

### 6. Hashtags
Relational (`hashtags` + `post_hashtags`), not a `tags[]` column — a real
join lets `GET /hashtags/:tag/posts` run as an indexed join instead of an
array-contains scan. `hashtagService.syncPostHashtags` re-parses and
re-links on every create/edit (delete-then-reinsert, not a diff). Frontend:
`PostText`/`renderTextWithLinks` (shared with mentions) renders `#tag` as a
link to `/hashtag/:tag`.

### 7. @mentions
`mentionService.notifyMentions` parses `@username`, resolves to user ids
(excluding self-mentions and blocked relationships), inserts `type =
'mention'` notifications — reuses the existing notifications table, no new
one. **This required building a profile page** (`/profile/:id` or
`/profile/:username` — the backend accepts either, since a mention only has
the username) since nothing linked to another user's profile anywhere in
the app before this. Includes Follow/Message/Block/Report actions. Frontend
composer autocomplete: `useMentionAutocomplete` (debounced `GET
/search/users`), wired into both the post composer and comment composer.

**Bug found and fixed:** `ProfileScreen`'s follow button was stuck on
"Follow" even when the backend correctly returned `is_following: true`,
because `useFollowToggle`'s `useState` only seeds once, at first mount, and
the hook was being called before `profile` had loaded (seeding from
`undefined`). Fixed by extracting the profile UI into a child component
keyed by `profile.id`, so it only ever mounts once real data exists.

### 8. Privacy toggle (public/private account)
`users.is_private` + `follows.status` (`accepted`/`pending`). A follow
request to a private account no longer auto-accepts; the target must
approve/deny (`GET /follow-requests`, `POST .../approve`, `DELETE
/follow-requests/:followerId`). Every post-visibility query (feed, public
posts, post detail, search, hashtag feed, bookmarks) gained the same
three-way OR: `NOT is_private OR viewer = author OR accepted-follower`.
Frontend: a real toggle switch in Settings (reusing `ThemeToggle`'s CSS,
new `PrivacyToggle` component) and a Follow Requests screen.

### 9. Change password / Deactivate / Delete account
All three require re-entering the current password server-side (not just a
frontend confirm step). Deactivate is a soft flag (`is_deactivated`) that
hides the account from every visibility query above, and **reactivates
automatically on the next successful login** — there's no separate
reactivate endpoint. Delete is a hard `DELETE FROM users`, relying on
migration 013's cascade — verified end-to-end (posts/comments/likes/
hashtag-links all gone after deleting the author). Frontend: `/settings/
account`, with `ConfirmDialog`'s `requireTypedConfirmation` (type your
username) gating the delete button specifically.

### 10. Email verification
`users.email_verified` + hashed `verification_token` (same SHA-256-of-a-
crypto-random-token pattern as password reset). Signup sends a verification
"email" (still console.log — see TASK 2's note; centralized into one
`utils/email.js` function so a real provider is a one-file swap). **Chose
the banner-only path** from the spec's "gate posting/messaging, or at
minimum show a banner" — hard-gating felt like too much friction for a
still-growing MVP with no real email deliverability yet; documented here as
the deliberate choice, not an oversight.

**Bug found and fixed:** the verify-email page fired its verification
request twice in dev (React StrictMode double-invokes effects), and the
second call — token already consumed by the first — overwrote a real
success with "Link expired or invalid" in the UI. Fixed with a ref guard
that only lets the effect's request fire once per token.

### 11. Rate limiting
Added a global floor (`globalLimiter`, 300 req/15min/IP) ahead of every
route; the feature-specific limiters built alongside features 1–10
(login/signup/forgot-password/report/follow/account-actions/resend-
verification) stack on top of it. `Retry-After` (seconds, RFC 9110) is now
set explicitly on every 429 alongside the existing `RateLimit-*` headers —
verified with curl that a real 429 carries both.

### 12. PWA support
`manifest.webmanifest` + a hand-drawn set of PNG icons (192/512/maskable-
512/apple-touch-180 — generated by `frontend/scripts/generate-pwa-icons.cjs`,
a from-scratch PNG encoder using only Node's built-in `zlib`, since no
image-editing tool was available; draws the same three-dot mark as
`components/layout/Logo.jsx`) + a basic app-shell service worker
(network-first, falling back to cache, falling back to the shell for
navigations). iOS gets its own `apple-touch-icon`/`apple-mobile-web-app-*`
meta tags in `index.html` since Safari doesn't read the manifest for "Add
to Home Screen". Verified via `vite preview` (prod build) that the manifest
loads, the service worker registers, and the app shell is actually cached.

### Known limitations / deviations
- **Anonymous interaction on the public post-detail page**: `/posts/:id`
  is the first page that renders while logged out, but Like/Bookmark still
  attempt an authenticated API call if tapped — the existing app-wide 401
  interceptor (`api.js`) then redirects to `/login`. Not a new bug (the
  interceptor already behaved this way everywhere), just newly reachable
  from a logged-out context. Not fixed in this batch — scoped as a UX
  polish item, not a functional gap.
- **Email verification is banner-only**, not enforced on posting/messaging
  (see Feature 10 above) — a deliberate scope decision, not a gap.
- **GET /feed never included the viewer's own posts** — pre-existing
  behavior (the query only selects `following_id`, never the viewer's own
  id), unrelated to this batch, left as-is since fixing it wasn't asked for
  and touches feed semantics beyond this batch's scope.
- **No real email provider** — signup/forgot-password/resend-verification
  all still log the link to the console (see TASK 2's original note); this
  batch centralized that into `utils/email.js` so swapping in Nodemailer/
  SendGrid/etc. later is a one-file change.

---

## Section A — Foundation (2026-09-24, tracked in ROADMAP.md)

Status per item lives in ROADMAP.md; this section records *how* each was
built and how to re-verify it.

### A1 — Automated API tests ✅
- `cd backend && npm test` runs Jest + Supertest: 80 tests, 10 files in
  `backend/tests/api/` (auth, profile, posts/feed, likes, comments,
  follow + private accounts, block, DM, search, bookmarks). ~25s.
- DB: a real, isolated Postgres 17 cluster in
  `backend/tests/.pgdata_test_cluster` (port 55433, trust auth,
  gitignored). `tests/globalSetup.js` creates/starts it and loads
  `tests/fixtures/schema.sql`; `globalTeardown.js` stops it. Tests never
  see `.env`'s `DATABASE_URL` (`tests/helpers/setupTestApp.js` mocks
  `db.js`).
- Test-only accommodations in app code: `server.js` exports `app` and only
  listens / starts Socket.io when run directly; rate limiters are no-ops
  when `NODE_ENV=test`; `__mocks__/sanitize-html.js` replaces an ESM-only
  dependency Jest can't load.
- Windows gotchas that made `npm test` hang (fixed): `pg_ctl start` must
  run with `stdio: 'ignore'`, and the cluster's log file must live
  outside its data dir.

### A2 — Reliability ✅
- Every data-fetching screen: loading → empty → error with "Try again"
  (shared `components/feed/FeedErrorState.jsx`). No retry on 404s.
- Socket: `SocketProvider` reconnects forever with backoff;
  `useConversationMessages` and `useConversations` both refetch on every
  reconnect; `components/messages/ConnectionBanner.jsx` shows
  "Reconnecting…" after 2s of downtime (Messages + Conversation).
- Search now sends the auth token (was silently anonymous).
- Verified in real Edge (headless, Playwright) against a throwaway local
  stack: 22-step walkthrough, 0 console errors / unhandled rejections;
  a backend kill → message inserted during the outage → restart showed the
  banner, then recovered the missed message, then sending worked again.
  - Why a backend kill instead of DevTools "Offline": Chromium's offline
    emulation doesn't close an already-open WebSocket, so it doesn't
    actually test a drop.

### A3 — Visual consistency ✅
- Every route now renders inside `PhoneShell` (480px mobile column).
  Pass `hideTabBar` for screens without primary nav: auth forms and the
  chat thread.
- Styling for the migrated pages lives in one shared file,
  `frontend/src/styles/screens.css`, built only on the `styles/tokens.css`
  names, so dark mode follows automatically. Building blocks:
  `.screen-header`/`.screen-header-title` (+ `IconButton` back button),
  `.screen-body`, `.screen-status`, `.form-stack`/`.form-field`/
  `.form-label`/`.form-input`, `.btn` + `.btn-primary`/`.btn-secondary`/
  `.btn-sm`/`.btn-block`, `.auth-screen`/`.auth-card`,
  `.card-list`/`.card-row`, `.conversation-screen`. Reuse these for any
  new screen instead of adding inline styles.
- The real current user for Menu/Settings/Home comes from
  `hooks/useCurrentUserSummary.js` (GET /profile/me). The mock user file
  is gone.
- `index.css` still has pre-rebrand globals (`#root` text-align:center,
  big `h1`/`h2`). New screens neutralize them locally; remove the globals
  once no older component CSS depends on them.
- Re-verify: `a3-visual` style check in headless Edge. Every route ×
  375/390/430px × light/dark checks for horizontal scroll, clipping,
  tab-bar position, light surfaces in dark mode, and console errors.

### A4 — GitHub Actions CI 🟡 (awaiting first run on GitHub)
- `.github/workflows/ci.yml` runs on push/PR to `master`, `main` and
  `dev`.
  - Backend: `npm test` against a `postgres:17` service container.
  - Frontend: `npm run lint` + `npm run build`.
  - No secrets needed.
- The test harness has two DB modes:
  - Local (no env var): auto-managed Windows cluster on port 55433.
  - CI (`TEST_DATABASE_URL` set): schema loaded into that DB.
- `backend/tests/setupEnv.js` pins test-only env values before the app
  loads, so tests never use `.env`'s real SMTP/Cloudinary/DB settings.
- To activate: push `dev` and check the Actions tab.

### A5 — Keep-alive cron 🟡 (activates after merge to master)
- `.github/workflows/keepalive.yml` curls `GET /` on the Render backend
  every 10 minutes, so the free instance never idles into a ~20s cold
  start.
- The URL defaults to `https://my-social-app-ecjg.onrender.com/`;
  override it with the `KEEPALIVE_URL` repo variable.
- Scheduled workflows only run from the default branch (`master`). Use
  "Run workflow" in the Actions tab for a manual check.
- Free-tier budget: one always-on service is about 730 of 750 free
  Render hours a month.

### A6 — Security & performance audit ✅
- **Post visibility has one source of truth:**
  `backend/services/postVisibilityService.js` → `getVisiblePost(postId,
  viewerId)`. It returns null for a deactivated author, a block in
  either direction, or a private account the viewer doesn't follow.
  Any new route that reads or writes a post by id must call it and
  answer 404 on null, never 403, so a hidden post's existence isn't
  confirmed.
- **Frontend:** calls to post-scoped endpoints must send the token, even
  on `optionalAuth` routes (comments, search, mentions). Without it the
  server treats the request as anonymous, so private-account content
  404s and block filtering is skipped.
- **Follower/following lists:** owner and accepted followers only for
  private accounts (`followController.connectionsAccessError`). Counts
  stay public.
- **Tests:** `backend/tests/api/visibility.test.js` covers the rules
  above.
- **Indexes:** migration 015 adds `conversation_participants(user_id)`
  plus the FK indexes that account/post delete cascades need. Apply it
  with `node scripts/run-migration.js migrations/015_add_fk_lookup_indexes.up.sql`.
  Migrations are plain SQL in a transaction; the runner sends each file
  as one query, so no `CONCURRENTLY`.
- **Code splitting:** only `HomeFeed` is eager; every other route is
  `React.lazy` in `App.jsx`, with `<Suspense>` in `PhoneShell`. Keep new
  screens lazy.

---

## Section B — Social features (tracked in ROADMAP.md)

### B1 — Reactions ✅
- **Data:** `likes.reaction` (migration 016): `like | love | haha | wow |
  sad | angry`, default `like`. One reaction per user per post, via the
  existing `UNIQUE(post_id, user_id)`. "Like count" now means total
  reactions.
- **API:**
  - `PUT /posts/:id/reaction { reaction }` sets or changes a reaction.
  - `DELETE /posts/:id/like` removes one.
  - `POST /posts/:id/like` is still the plain like.
  - Each returns `{ myReaction, likeCount, reactionCounts }`.
- **Post payloads:** every listing adds `my_reaction` and
  `reaction_counts`. Use `reactionService.reactionColumnsSql('$N')` in
  any new post query so the fields stay consistent.
- **Frontend:** `components/feed/ReactionButton.jsx` (button + picker),
  `hooks/useLikeToggle.js` (optimistic state; `toggle()` / `react(type)`),
  `utils/reactions.js` (emoji/label/color list). Keep that list in sync
  with `reactionService.REACTIONS` and the migration's CHECK.
- **Deploy:** run migration 016 before deploying a backend that includes
  B1.

### B2 — Multiple images per post ✅
- **Data:** `post_media(post_id, url, position)` (migration 017) holds
  the ordered image list. `posts.image_url` still mirrors the first image
  for older readers; don't drop it without checking search and older
  clients.
- **Upload:** `POST /posts` takes up to 10 repeated `images` fields
  (legacy `image` still works). Middleware: `uploadPostImages` +
  `uploadManyToCloudinary` (`middleware/cloudinaryUpload.js`), which
  sets `req.cloudinaryResults` in the order sent. The post and its media
  are inserted in one SQL statement.
- **Payloads:** `media: [{url}]` on every post, via
  `reactionService.mediaColumnSql()`. Add it to any new post query.
- **Frontend:** `components/feed/MediaCarousel.jsx` (scroll-snap
  carousel; one image renders plain) and CreatePost's multi-select grid.
- **Tests:** Cloudinary is mocked in `tests/helpers/setupTestApp.js`,
  with fake URLs numbered in upload order.
- **Deploy:** run migrations 015 → 016 → 017 before deploying the
  matching backend.

### B3 — Stories ✅
- **Data:** `stories` (24h `expires_at`) and `story_views` (migration
  018). Expiry is a query-time filter, so there's no cron. Every read
  must keep `expires_at > now()`.
- **API** (`controllers/storiesController.js`):
  - `POST /stories` (multipart `image`), `GET /stories`,
    `POST /stories/:id/view`, `DELETE /stories/:id`.
  - `GET /stories` returns the tray grouped by author:
    `[{ user_id, username, avatar_url, is_own, all_seen, stories: [...] }]`.
  - Visibility is self plus accepted follows, minus blocks and
    deactivated accounts. It lives in one SQL fragment,
    `VISIBLE_TO_VIEWER_SQL`, so reuse that for any new story query.
- **Frontend:** `hooks/useStories.js` (tray, add, optimistic seen,
  delete), `components/feed/StoriesRow.jsx` (tray),
  `components/feed/StoryViewer.jsx` (full-screen player, portal to
  body). All mounted by `screens/HomeFeed.jsx`.
- **Deploy:** migrations 015 → 016 → 017 → 018 before the matching
  backend.

### B4 — Comment replies + comment likes ✅
- **Data:** `comments.parent_comment_id` and `comment_likes` (migration
  019). Replies are one level deep: the API flattens a reply-to-a-reply
  onto the top-level comment.
- **API:**
  - `POST /posts/:id/comments { content, parentCommentId? }`.
  - `POST` / `DELETE /comments/:id/like` return `{ likedByMe, likeCount }`.
  - Comment lists include `parent_comment_id`, `like_count` and
    `liked_by_me`.
- **Notifications:** new types `reply` and `comment_like`. Rule: one
  notification per person per action. Pass `excludeUserIds` to
  `mentionService.notifyMentions` for anyone already notified another
  way.
- **Frontend:** `hooks/useComments.js` (`startReply`, `cancelReply`,
  `toggleCommentLike`, optimistic) and `components/feed/CommentSection.jsx`
  (threads via `buildThreads`, `CommentItem`).
- **Deploy:** migrations through 019 before the matching backend.

### B5 — Post audience (Public / Followers only) ✅
- **Data:** `posts.visibility` `'public' | 'followers'` (migration 020).
- **The rule:** visible to the author and accepted followers; to anyone
  else only if the account is public AND the post is public. In listing
  SQL that's the predicate
  `(NOT users.is_private AND posts.visibility = 'public') OR author OR
  accepted follower`. Copy it into any new post-listing query. By-id
  access goes through `postVisibilityService.getVisiblePost`.
- **API:** `POST /posts` (`visibility` field); `PUT /posts/:id` accepts
  `content` and/or `visibility`.
- **Frontend:** CreatePost's `.audience-picker`; the PostCard header
  icon; the PostMenu item delegates to PostCard's `toggleVisibility`.
- **Deploy:** migrations through 020 before the matching backend.

### B6 — Profile tabs ✅
- **API:** `GET /users/:id/posts?tab=posts|photos|tagged` in
  `controllers/userPostsController.js`.
  - "Tagged" = others' posts that @mention the user, built with
    `mentionPattern(username)`: regex-escaped, word-boundary,
    case-insensitive.
  - The same visibility predicate as the feed applies. A private account
    returns 403 to non-followers.
- **Saved tab:** the viewer's own `GET /bookmarks`, shown on your own
  profile only.
- **Frontend:** `components/profile/ProfileTabs.jsx` (ARIA tabs, photo
  grid) and `hooks/useProfileTabPosts.js`, mounted in
  `screens/ProfileScreen.jsx`. The Settings profile row links to
  `/profile/<your id>`.
- No migration.

### B7 — Explore ✅
- **API** (`controllers/exploreController.js`):
  - `GET /explore/hashtags`: top 10 tags over 7 days, counting only
    publicly visible posts.
  - `GET /explore/posts`: viewer-visible, engaged posts, scored
    `(reactions + 2×comments) / (hours+2)^1.5`.
  - Tune the window in `EXPLORE_WINDOW`, and the weights and gravity in
    the SQL.
- **Frontend:** `screens/ExploreScreen.jsx` (`/explore`),
  `components/explore/TrendingHashtags.jsx` (also shown on Search before
  a query), `hooks/useExplore.js`.
- **Scale note:** move trending to a periodically refreshed materialized
  view once traffic grows.

### B8 — People you may know ✅
- **API:** `GET /users/suggestions` (`controllers/suggestionsController.js`).
  It returns friends-of-friends by mutual count, then follows-you (+2),
  then popular public accounts as a fallback. Every row carries a
  `reason` (`mutuals | follows_you | popular`) and `mutual_sample`.
  Shared exclusions live in `ELIGIBLE_SQL`.
- **Frontend:** `components/explore/PeopleYouMayKnow.jsx`, on Explore
  and on Search before a query.
- **Follow state:** `useFollowToggle` now returns `requested` (a pending
  request to a private account), and `FollowButton` shows "Requested".
  Use this pair for any new follow button.

### B9 — DM edit / reply / images ✅
- **Data:** migration 021 adds `message_type 'image'` (its own run: an
  enum value can't be used in the transaction that adds it). Migration
  022 adds `messages.reply_to_message_id` and the image CHECK.
- **Service** (`services/messageService.js`):
  - `editMessage` (own text, not deleted, 15-minute
    `MESSAGE_EDIT_WINDOW_MS`).
  - `sendImageMessage`.
  - `validateReplyTo` (same conversation only).
  - `attachReplyPreviews` (batched `reply_to` on every message).
  - `scrubDeletedContent` now also nulls `media_url`/`duration_seconds`.
- **Transport:**
  - Socket `edit_message` broadcasts `message_edited`.
  - `send_message` accepts `replyToMessageId`.
  - REST: `PUT .../messages/:id` and `POST .../messages/image`.
- **Frontend:**
  - `useConversationMessages` gains `editMessage`, `sendImageMessage`
    and `retryImageSend`; `syncQuotes` keeps reply quotes current.
  - `MessageBubble` has the quote, image, edited label, Reply/Edit
    actions and inline edit.
  - `MessageComposer` has the reply bar and the photo button.
- **Deploy:** migrations through 022 before the matching backend.

### B10 — Group chat ✅
- **Data:** `conversations.type = 'group'` with `name` and `created_by`,
  plus `conversation_participants.role` (migration 023). Direct chats
  are unchanged.
- **API:** `controllers/groupController.js`: create, details, rename,
  add and remove/leave. Rules are in its header comment: 50-member cap,
  no blocked or deactivated members, admin handover, and deletion when
  empty.
- **Group-aware code paths:**
  - `messageService.assertNotBlocked` skips groups.
  - `markDelivered`/`markRead` skip per-message status for groups.
  - `getConversations` returns both kinds.
  - `getConversationType()` is the helper to use for any new check.
- **Realtime:** each socket joins `user_<id>`, and `syncRooms` moves
  members' sockets in and out of `conv_<id>` rooms. `group_updated` tells
  clients to refetch details.
- **Frontend:**
  - `screens/CreateGroupScreen.jsx`, `screens/GroupInfoScreen.jsx` and
    `components/messages/MemberPicker.jsx`.
  - `Conversation.jsx` fetches details (`fetchConversationDetails`) for
    the group header, sender names and typing names.
- **Deploy:** migrations through 023 before the matching backend.

### B11 — Notification settings ✅
- **Always create notifications with
  `notificationService.notify({ userId, actorId, type, postId?, commentId? })`**,
  never a raw INSERT. It enforces the recipient's settings and skips
  self-notifications.
  - A new type needs an entry in `CATEGORY_BY_TYPE`, or it throws.
  - For batched inserts, filter recipients with
    `allowedSql(category, '<recipient id sql>')`, as `mentionService`
    does.
- **Data:** `notification_preferences` (migration 024); no row means all
  on.
- **API/UI:** `GET` / `PUT /notification-preferences`; the
  `/settings/notifications` screen (`screens/NotificationSettingsScreen.jsx`).
- **Deploy:** migrations through 024 before the matching backend.

### B12 — Admin moderation ✅
- **Admins:** `users.is_admin`, granted only by
  `node scripts/make-admin.js <username> [--revoke]`. No API or UI can
  grant it. `middleware/requireAdmin.js` checks the DB on every request
  and 404s for non-admins.
- **API:** `controllers/adminController.js`:
  - `GET /admin/reports`, `POST /admin/reports/:id/dismiss|remove-content`,
    `POST /admin/users/:id/ban|unban`.
  - Acting on a report resolves every pending report on that target.
- **Bans:** `banned_at` plus `is_deactivated`, so the existing visibility
  rules hide the user's content. `services/accountStatusService.isBanned`
  is enforced in `authMiddleware` (401 → frontend logout), `optionalAuth`
  (anonymous), `socketAuth` (refused), and login (403, before
  auto-reactivation). Live sockets are disconnected on ban.
- **Express 5 note:** `server.js` defaults `req.body` to `{}`. Don't
  remove it; body-less requests would crash handlers.
- **Frontend:** `screens/AdminScreen.jsx` (`/admin`); a Settings "Admin"
  section when `useCurrentUserSummary().isAdmin`.
- **Deploy:** migrations through 025, then `make-admin.js` for your
  account.

### B13 — Groups (communities) ✅
- **Naming:** the DB and API say `communities`, to avoid clashing with
  B10 group *chats*. The UI says "Groups".
- **Schema (migration 026):**
  - `communities` has a `privacy` of public or private.
  - `community_members` has a `role` of admin or member and a
    `status` of member or pending.
  - `posts.community_id` is NULL for normal posts.
- **API:** `controllers/communityController.js` and
  `routes/communityRoutes.js`:
  - `GET/POST /communities`, `GET/PATCH /communities/:id`,
    `POST /communities/:id/join`.
  - `DELETE /communities/:id/members/:userId` (leave, remove, deny or
    cancel).
  - `PUT .../members/:userId/role`, and `GET .../requests` with
    `POST .../requests/:userId/approve`.
  - `GET .../posts` and `GET .../members`.
  - Group posts are created by `POST /posts` with `communityId`.
- **Visibility:**
  - `services/postVisibilityService.getVisiblePost` is the single
    per-post check, including group membership.
  - Listings use `communityVisibleSql()`, or simply
    `community_id IS NULL` for global feeds. **Any new post listing must
    exclude or filter group posts.**
- **Frontend:**
  - `services/communityService.js`.
  - `screens/GroupsScreen.jsx`, `CreateCommunityScreen.jsx`,
    `CommunityScreen.jsx` and `ManageCommunityScreen.jsx`.
  - A Menu row.
  - `CreatePost` `?communityId=`.
  - The `PostMenu` `canModerate` prop.
- **Deploy:** migration 026 after 025.

### B14 — Pages ✅
- **Schema (migration 027):**
  - `pages` (name, category, description, owner_id).
  - `page_follows` (page_id, user_id).
  - `posts.page_id`, with CHECK `posts_group_or_page`.
- **Model:** one owner per page, who posts *as* the page. `posts.user_id`
  is still the owner, so every ownership, block and ban rule applies
  unchanged.
- **API:** `controllers/pageController.js` and `routes/pageRoutes.js`:
  - `GET/POST /pages` returns {owned, following, discover}, with `?q=`
    search.
  - `GET/PATCH/DELETE /pages/:id` and `GET /pages/:id/posts`.
  - `POST/DELETE /pages/:id/follow`.
  - Page posts are created by `POST /posts` with `pageId` (owner only,
    forced public).
- **Visibility:**
  - Page posts are public, even for a private owner. Listings use
    `(NOT users.is_private OR posts.page_id IS NOT NULL) AND
    posts.visibility = 'public'`, and `getVisiblePost` returns early for
    page posts after the deactivated and block checks.
  - The Home feed is followed people's *personal* posts plus posts from
    followed pages.
  - Profile Posts/Photos tabs exclude page posts.
- **Post rows:** `pageColumnSql()` (in `services/reactionService.js`,
  next to `mediaColumnSql`) adds `page: {id, name} | null`. Add it to
  any new post listing.
- **Frontend:**
  - `services/pageService.js`.
  - `screens/PagesScreen.jsx`, `CreatePageScreen.jsx`,
    `PageScreen.jsx` and `EditPageScreen.jsx`, which reuse
    `GroupsScreen.css`.
  - PostCard renders `post.page` as the author.
  - `CreatePost` `?pageId=`.
  - A Menu row.
- **Deploy:** migration 027 after 026.

---

## How to use this file

- Keep this file (and CLAUDE.md) in your project root or somewhere safe.
- When starting a new task with Claude Code (or any AI), paste the relevant
  TASK section so it has full detail without you re-explaining.
- After finishing a task, you can ask Claude (chat) to update this file's
  checklist or add notes about what you actually did differently.
