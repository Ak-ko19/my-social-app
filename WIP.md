# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 8 — Session revocation (not started)
**Step:** —

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations)
  and update the checklist's migration list/loop if migrations were added.
- Any new migration (e.g. Day 8's token_version) must: add up + down
  files, update backend/tests/fixtures/schema.sql, and pass the
  rehearsal (up, schema match, down restores, old code still works).
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.

## Plan
(written at the start of each step)

## Progress
(nothing in progress — Day 6 closed and Day 7 skipped 2026-09-29)
