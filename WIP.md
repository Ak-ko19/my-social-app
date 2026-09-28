# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 5 — Working email in production (not started)
**Step:** —

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
(written at the start of each step)

## Progress
(nothing in progress — Day 4 closed 2026-09-28)
