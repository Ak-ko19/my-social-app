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

## Plan — Day 9 step 1: scheduled cleanup job
- `services/cleanupService.js` run({ dryRun }) → counts:
  - stories expired > 1 h ago: rows deleted (story_views cascade), then
    their Cloudinary media via deleteMedia (after the rows are gone);
  - notifications older than 90 days (read or not);
  - sessions expired, or revoked more than 1 day ago (Day 8 carry-over);
  - batched (stories 500, notifications/sessions 5000 per statement,
    bounded loops) so one run can't hold a long lock on Render/Neon.
- Migration 029_add_cleanup_indexes: stories(expires_at),
  notifications(created_at), sessions(expires_at) — the cleanup scans
  are global, the existing indexes are per-user composites.
- Endpoint POST /internal/cleanup, `Authorization: Bearer
  <CLEANUP_SECRET>`:
  - CLEANUP_SECRET unset → 404 (endpoint effectively absent);
  - wrong/missing secret → 404 too (don't advertise it), compared in
    constant time (sha256 + timingSafeEqual);
  - `?dryRun=1` → counts only. Response: counts + duration; one log line.
- config/env.js: CLEANUP_SECRET set but < 32 chars → error; production
  without it → warning (cleanup disabled).
- `.github/workflows/cleanup.yml`: daily 03:17 UTC + manual run; URL from
  vars.CLEANUP_URL or the Render default; secret CLEANUP_SECRET; if the
  secret isn't set yet → notice + success (no failing runs before the
  owner sets it up); curl retries through a cold start. Runs only from
  master (GitHub schedule rule) → after GO LIVE.
- `npm run cleanup [-- --dry-run]` runs the same service directly (for
  the owner / local).
- LATER.md: owner adds CLEANUP_SECRET on Render + the same value as a
  GitHub Actions secret.
- Tests: service (each rule, keeps what must stay, media deleted after
  rows, dry run), endpoint (404s, 200, dry run), env rules, workflow
  YAML parses with the expected triggers.

## Progress
- [x] migration 029 + fixture
- [x] cleanupService + CLI (`npm run cleanup [-- --dry-run]`)
- [x] endpoint + env (CLEANUP_SECRET; 404 unless the secret matches)
- [x] workflow .github/workflows/cleanup.yml (skips until the secret
  exists)
- [x] tests: cleanup.test.js 9, mutation-checked (grace, retention,
  media, batching, secret check); env tests updated
- [x] Backend 366/366; rehearsal 015→029 PASSED (new + old code); CLI
  checked on the throwaway DB; b3 green
- [x] Docs: .env.example, LATER.md #4 (owner: CLEANUP_SECRET on Render +
  GitHub), GO_LIVE_CHECKLIST (migration 029, env row)
- STEP 1 DONE (Day 9 has one step)
