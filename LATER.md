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
- **Day 13 addition: browser tests in CI.** The "Browser tests (smoke)"
  job is the first one that runs on Linux, and nothing here can run
  Linux (no WSL or Docker). Its Windows equivalent passes with the same
  settings.
  - If it's red, download the `e2e-output-browser-smoke` artifact from
    that run and paste the failing `out-*.txt` (or `stack.log`) into the
    next session.
  - The full browser run starts only by hand (Actions → CI → Run
    workflow) or on a pull request to master.
- **CI minutes:** a private repo gets 2000 free minutes a month. Each push
  to `dev` now uses about 15 minutes (backend, frontend, browser smoke).
  If Settings → Billing shows the limit getting close, tell the next
  session and it can make the smoke job manual-only.

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
  - **Day 21 (GO LIVE #3) was skipped (2026-10-03).** `dev` is now
    Days 1–20. The checklist covers migrations 015 → 035, smoke tests up
    to Day 20, and rollback notes for "only me" posts. The rehearsal
    passed on that `dev`.
  - **Day 14 (GO LIVE #2) was skipped too (2026-10-01).** `dev` is now
    Days 1–13. The checklist covers migrations 015 → 032 and its smoke
    tests up to Day 12. The rehearsal passed on that `dev` the same day.

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

## 5. (Optional) Send server errors to Sentry too (Day 10)
- **Not needed:** every error is already saved in the app's own error log
  (Settings → Moderation → Errors), with counts and details.
- **What Sentry adds:** email alerts and richer grouping. Its free plan
  is enough.
- **Owner steps:**
  1. Create a free account at https://sentry.io and a **Node.js**
     project.
  2. Copy its **DSN** (it looks like
     `https://<key>@<something>.ingest.sentry.io/<id>`).
  3. Render → backend service → **Environment** → add `SENTRY_DSN` =
     that DSN. Save; Render redeploys.
- **Check it worked:** the Render logs show
  `[errors] Sentry reporting is on.` at startup.

## 6. (Optional) Turn on Cloudflare Turnstile (Day 11)
- **Not needed:** signup and forgot password already have a hidden
  honeypot field, a minimum fill time and tight rate limits. Login slows
  down after repeated wrong passwords.
- **What Turnstile adds:** a free "are you human?" check from Cloudflare
  on signup and forgot password. It's for when bots get past the rest.
  Login is never affected.
- **Needs:** this version deployed first (a GO LIVE, item 2). The CSP in
  `frontend/vercel.json` already allows Cloudflare's widget.
- **Owner steps:**
  1. Create a free Cloudflare account. Open **Turnstile → Add widget**,
     add your frontend's domain (the Vercel URL) and choose
     **Managed** mode.
  2. Render → backend service → **Environment** → add
     `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` from that page.
     Save; Render redeploys. Both are needed: with only one set, the check
     stays off and the Render logs show a warning.
- Nothing needs setting on Vercel: the frontend gets the public site key
  from the backend (`GET /config`).
- **Check it worked:**
  - `https://<backend>/config` shows your `turnstileSiteKey`.
  - The signup page shows the Cloudflare box.
- **To turn it off again:** delete either variable.

## 7. (Optional) Turn on push notifications (Day 22)
- **What it does:** people who switch it on (Settings → Notifications →
  "Push notifications on this device") get likes, comments, follows,
  mentions and messages on their phone or computer even when the app is
  closed. It uses the browsers' own free push services.
- **Not needed:** without it, everything works as now, and the switch
  simply isn't shown.
- **Needs:** this version deployed first (GO LIVE, item 2).
- **Owner steps (2 minutes, no account needed):**
  1. In `backend/` on your computer, run
     `npx web-push generate-vapid-keys`. It prints a Public Key and a
     Private Key.
  2. Render → backend service → **Environment** → add
     `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from step 1, and
     `VAPID_SUBJECT` = `mailto:` followed by your email address. Save;
     Render redeploys.
  3. Keep the private key secret. If you ever change the keys, everyone
     has to switch push on again.
- **Check it worked:**
  - `https://<backend>/push/config` shows your public key.
  - In the app, switch push on and ask a friend to like your post: a
    notification appears.
