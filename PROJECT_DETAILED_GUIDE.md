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

## How to use this file

- Keep this file (and CLAUDE.md) in your project root or somewhere safe.
- When starting a new task with Claude Code (or any AI), paste the relevant
  TASK section so it has full detail without you re-explaining.
- After finishing a task, you can ask Claude (chat) to update this file's
  checklist or add notes about what you actually did differently.
