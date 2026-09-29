# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 5 — Working email in production
**Step:** Day close-out (all 4 steps done and pushed: `53fa111`, `756c953`,
`ca60e8c`, `49c44c7`).

## Close-out status
- Full browser run (2026-09-28): everything green EXCEPT b14-pages
  "unfollow from the page" (1 check), which had passed in every earlier
  run.
- Cause (test bug, not app): `getByRole('button', { name: 'Follow' })` is
  a substring match, and "Following" contains "Follow", so the wait
  passed at once and read the follower count before the unfollow
  response arrived. PageScreen updates button + count from the same
  server response, so the app is right.
- Fix (uncommitted, reviewed): `exact: true` on that wait; the owner
  check uses /^Follow(ing)?$/.
- Other suites checked for the same trap: b8 (clicks "Follow" before any
  "Following" exists) and b10 ("Save") are fine.

## Progress
- [x] Fix written
- [x] VERIFY: b14 five runs in a row: 20/20 each time
- [ ] Full browser run, Progress Log, clear WIP, commit, push

## Carry-over notes
- Day 6 GO_LIVE_CHECKLIST.md must include:
  - after deploy, a rate-limit check from two networks (wrong logins on
    one must not lock the other), the only way to confirm Render's
    one-hop proxy setting;
  - delete a test post with a photo and check its image URL stops
    loading (Cloudinary cleanup can't be tested locally: no credentials);
  - run `npm run cloudinary:orphans` (dry run) once, then with --delete;
  - required env vars now enforced at startup (config/env.js):
    DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS, FRONTEND_URL (production);
  - optional: BREVO_API_KEY + EMAIL_FROM (LATER.md #3); check GET /config.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
