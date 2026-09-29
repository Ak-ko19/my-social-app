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
- **Access check (Day 6, 2026-09-29):**
  - **Production database:** Claude Code has none, by design.
    `backend/.env` exists but wasn't opened, and CLAUDE.md forbids using
    production.
  - **Render and Vercel dashboards:** no access (no accounts or tokens
    here). Whether a push to `master` auto-deploys is unknown here.
    GO_LIVE_CHECKLIST step 2 asks you to note it, and step 4 covers both
    cases.
  - **Live backend today:** the `master`-era code. `/config` answers 404
    because this work isn't deployed yet.
  - **Live frontend URL:** not recorded in the repo. It's what
    `ALLOWED_ORIGINS` must be set to (checklist step 2).
  - **So Day 7 (GO LIVE #1) was skipped** and the work continued with
    Day 8, as MONTH_PLAN says. The same applies to every later GO LIVE
    day until you run the checklist.

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

## 4. Turn on the daily cleanup job (Day 9)
- **Why:** once a day it deletes, so tables don't fill Neon's 0.5 GB and
  expired photos don't stay public:
  - expired stories (and their photos on Cloudinary);
  - notifications older than 90 days;
  - dead login sessions.
- **Until then:** nothing breaks. The data just isn't pruned. The GitHub
  job skips itself with a notice.
- **Needs:** this version deployed and merged to `master` (GitHub only
  runs schedules from the default branch).
- **Owner steps (about 5 minutes, free):**
  1. Make a long random value, e.g. in Git Bash:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  2. Render → backend service → **Environment** → add `CLEANUP_SECRET`
     = that value. Save; Render redeploys.
  3. GitHub → the repo → **Settings → Secrets and variables → Actions →
     New repository secret** → name `CLEANUP_SECRET`, same value.
  4. GitHub → **Actions → Cleanup → Run workflow**, and tick "Only count"
     for a first dry run. The log shows how many stories, notifications
     and sessions it would delete. Then run it without the tick, or just
     let the daily schedule (03:17 UTC) do it.
- To preview from your own computer instead:
  `DATABASE_URL="$PROD_DB" npm run cleanup -- --dry-run` (in `backend/`).
