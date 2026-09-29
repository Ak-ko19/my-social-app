# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 10 — Monitoring (not started)
**Step:** —

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations)
  and update the checklist's migration loop if migrations were added.
- Any new migration: up + down files, update tests/fixtures/schema.sql
  (+ testDb TABLES), and the rehearsal must pass.
- Day 10 error-log table: the Day 9 cleanup job (services/cleanupService)
  should prune it too (bounded retention), so it can't grow forever.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
- Playwright gotcha seen 3× now: getByRole/getByLabel/getByText name
  matching is a SUBSTRING match — use `exact: true` when one label is
  contained in another.

## Plan
(written at the start of each step)

## Progress
(nothing in progress — Day 9 closed 2026-09-29)
