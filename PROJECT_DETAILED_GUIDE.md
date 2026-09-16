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

## How to use this file

- Keep this file (and CLAUDE.md) in your project root or somewhere safe.
- When starting a new task with Claude Code (or any AI), paste the relevant
  TASK section so it has full detail without you re-explaining.
- After finishing a task, you can ask Claude (chat) to update this file's
  checklist or add notes about what you actually did differently.
