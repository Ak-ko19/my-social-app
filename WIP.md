# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 9 — Cleanup jobs (not started)
**Step:** —

## Carry-over notes
- Day 9's job must clean: expired stories (+ their Cloudinary media via
  mediaCleanupService.deleteMedia, + story_views cascade), old
  notifications, AND expired/revoked sessions (one row per login,
  migration 028). No new outside account: GitHub Actions cron calling a
  protected endpoint (secret in a GitHub Actions secret — the OWNER must
  add it → LATER.md; the job must be harmless/no-op until then).
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations)
  and update the checklist's migration loop if migrations were added.
- Any new migration: up + down files, update tests/fixtures/schema.sql
  (+ testDb TABLES), and the rehearsal must pass.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
- Playwright gotcha seen 3× now: getByRole/getByLabel/getByText name
  matching is a SUBSTRING match — use `exact: true` when one label is
  contained in another ("Follow"/"Following", "New password"/"Confirm
  new password", Myanmar "ဤစက်" inside the intro).

## Plan
(written at the start of each step)

## Progress
(nothing in progress — Day 8 closed 2026-09-29)
