# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 5 — Working email in production
**Step:** 1 — HTTP email adapter (Brevo API) that turns on only when its env var exists; keep Nodemailer for local dev.

## Carry-over notes
- Day 6 GO_LIVE_CHECKLIST.md must include:
  - after deploy, a rate-limit check from two networks (wrong logins on
    one must not lock the other), the only way to confirm Render's
    one-hop proxy setting;
  - delete a test post with a photo and check its image URL stops
    loading (Cloudinary cleanup can't be tested locally: no credentials);
  - run `npm run cloudinary:orphans` (dry run) once, then with --delete;
  - required env vars now enforced at startup (config/env.js):
    DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS, FRONTEND_URL (production).
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.

## Plan
- Why: Render's free tier blocks outbound SMTP, so Nodemailer can't
  deliver in production. Brevo's free tier (300/day) has an HTTPS API.
- `utils/email.js`: pick the provider on every call (env read at call
  time → testable, no restart ordering issues):
  1. `BREVO_API_KEY` set → Brevo HTTP API:
     POST https://api.brevo.com/v3/smtp/email, header `api-key`,
     body { sender: {email, name}, to: [{email}], subject, textContent }
     (contract checked against Brevo's API reference). 10 s timeout
     (AbortSignal.timeout). 201 = sent.
  2. else EMAIL_HOST/USER/PASS → Nodemailer SMTP (local dev, unchanged).
  3. else not configured → today's fallback (step 2/3 change it).
- Sender: EMAIL_FROM "Name <addr>" or "addr" (parsed; Brevo needs a
  sender verified in the Brevo account). Missing/invalid with Brevo →
  not sent, clear log + startup warning.
- `sendEmail()` still never throws; now returns true/false (sent or not)
  and exports `emailProvider()` ('brevo' | 'smtp' | null) for step 3.
- Logs never contain the API key or the email body; failures log the
  provider, HTTP status and Brevo's error code/message.
- config/env.js warnings: BREVO_API_KEY without a valid EMAIL_FROM.
- .env.example: BREVO_API_KEY + sender note.
- Tests (tests/api/email.test.js): exact Brevo request; sender parsing;
  Brevo error / network error / timeout → false, logged, no key in logs;
  Brevo wins over SMTP; SMTP path via mocked nodemailer; signup sends
  the verification email through Brevo (mocked fetch); env warnings.
- Not verifiable here: a real Brevo send (no account/key) → LATER.md
  (step 4 of this Day).

## Progress
- [x] email.js providers (Brevo contract checked against Brevo's API
  reference: POST /v3/smtp/email, api-key header, 201 {messageId})
- [x] env.js warning + .env.example
- [x] tests/setupEnv.js pins BREVO_API_KEY='' (a real key in .env would
  otherwise make the test suite send real emails)
- [x] tests/api/email.test.js 11/11
- [x] Also pinned BREVO_API_KEY blank in e2e/e2e-up.sh and env.test.js's
  server launches (same real-email risk as setupEnv)
- [x] Backend 328/328; a2 22/22, b11 9/9; diff review clean
- STEP 1 DONE
- Note: signup awaits sendEmail, so a slow Brevo delays signup up to the
  10 s timeout (Brevo is normally ~0.2 s). Acceptable for now.

## Prep for steps 2–3 (read-only, done while the permission check was down)
- Verification is NEVER enforced (login, posting, etc. all work
  unverified); the only UI is EmailVerificationBanner on Home (prompt +
  "Resend" button).
- ForgotPassword.jsx shows the server's message (serverText) or a
  generic error; the server answers the same enumeration-safe text
  whether or not the email exists.
- Step 2: sendEmail's no-provider fallback logs the whole email (live
  reset/verify link). In production (NODE_ENV=production or RENDER=true)
  log only "email not sent: no provider" + recipient domain at most,
  never the text; keep the full log in local dev.
- Step 3 idea: expose "can we send email?" (e.g. `emailEnabled` on login
  / GET /profile/me, or a tiny public GET /config), then:
  - hide the verify banner when email is disabled (don't promise an
    email that never comes);
  - forgot-password: when disabled, answer with a clear, translated
    message ("Password reset by email isn't available yet …") instead of
    the "link sent" text; keep it enumeration-safe (same answer for
    every address).
