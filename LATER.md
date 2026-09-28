# LATER — things only the owner can do

Claude Code skips these and keeps building everything else so the app works
without them. Newest items at the bottom.

## 1. Check the first CI run on GitHub (Day 1)
- `dev` was pushed on 2026-09-28, which triggers `.github/workflows/ci.yml`.
- Claude Code can't see the Actions tab here: the repo is private, `gh` isn't
  installed, and the browser extension isn't connected.
- The same jobs pass locally: backend API tests, frontend lint,
  `check:i18n` and build.
- **Owner:** open https://github.com/Ak-ko19/my-social-app/actions and check
  that the "CI" run on `dev` is green. If it's red, paste the failing log
  into the next session.
- Optional: install the GitHub CLI (`winget install GitHub.cli`, then
  `gh auth login`) so future sessions can read CI results themselves.

## 2. Merging to master and GO LIVE days (Days 7, 14, 21, 30, …)
- CLAUDE.md's hard limits forbid Claude Code from pushing or merging to
  `master` and from touching the production database.
- Those limits override MONTH_PLAN's GO LIVE steps, so every GO LIVE is an
  owner action.
- Until `dev` is merged, the keep-alive schedule doesn't run: GitHub only
  runs `schedule` workflows from the default branch (`master`).
- On 2026-09-28 the live backend answered `GET /` with 200 after a
  **22.1 s cold start**.
- **Owner:** when ready, follow GO_LIVE_CHECKLIST.md (written on Day 6).
  To let Claude Code do GO LIVE steps itself, change the hard limits in
  CLAUDE.md.

## 3. Add a Brevo API key to turn on real emails (Day 5)
- **Why:** password reset and email verification need to send emails.
  Render's free plan blocks normal (SMTP) email, so the app uses Brevo's
  web API instead. The code is ready and switches on by itself when the
  key exists.
- **Until then:**
  - Nothing breaks and nobody is locked out.
  - The "verify your email" banner is hidden.
  - "Forgot password" says reset by email isn't available yet.
  - Signup and login work normally.
- **Needs:** this version deployed first (a GO LIVE, item 2).
- **Owner steps (about 10 minutes, free plan: 300 emails/day; Brevo's menu
  names may differ slightly):**
  1. Create a free account at https://www.brevo.com.
  2. In Brevo, open **Senders, Domains & Dedicated IPs → Senders** and
     add and verify the address emails should come from (Brevo sends a
     confirmation email to it).
  3. Open **SMTP & API → API Keys** and create a key. Copy it; it's shown
     once.
  4. In the Render dashboard, open the backend service, then
     **Environment**, and add:
     - `BREVO_API_KEY` = the key from step 3
     - `EMAIL_FROM` = `MySocialApp <the-address-from-step-2>`
  5. Save. Render redeploys by itself.
- **Check it worked:**
  - Open `https://my-social-app-ecjg.onrender.com/config`. It should say
    `{"emailEnabled":true}`.
  - Use "Forgot password" with your own address. The email should arrive
    within a minute.
- **If no email arrives:**
  - Render → Logs shows `[email] Brevo refused …` with Brevo's reason
    (for example, the sender isn't verified).
  - The key and the email text are never written to the logs.
