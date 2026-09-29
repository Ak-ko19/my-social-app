# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 6 — Go-live preparation (not started)
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
    DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS, FRONTEND_URL (production);
  - optional: BREVO_API_KEY + EMAIL_FROM (LATER.md #3); check GET /config.
- CLAUDE.md hard limits: Claude Code never touches the production DB or
  .env and never merges to master → Day 6 step 3 ("check what access
  exists") must only look at what's in the repo, never read .env.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.

## Step 1 — GO_LIVE_CHECKLIST.md (DONE)
- Sections: before you start, backup (pg_dump file + Neon branch), env
  vars table, migrations 015→027 (pre-checks, one-file loop, post-check),
  deploy order (backend then frontend), make-admin, smoke tests (incl.
  Day 2/3/4 live checks), rollback A/B/C.
- Found: master's code ignores posts.visibility, community_id and bans,
  so a code-only rollback after people use those features leaks private
  posts and unbans users → rollback B is time-boxed with a warning, C
  says fix forward or restore the backup.
- Added `*.dump` / `*.sql.gz` to .gitignore (backups hold user data).
- Verified locally on the throwaway e2e DB: pg_dump, both check
  queries, pg_restore --clean --if-exists (restored deleted posts).
  The migration loop is Day 6 step 2's test.

## Step 2 plan — test migrations 015–027 on a production-shaped DB
- Production can't be copied (hard limit), so REBUILD its schema: the
  test fixture at e542027 (2026-09-24) is the 014 state (verified: has
  014's verification_token, nothing from 015+) + migrations 001/002
  (perf/trigram indexes live on prod but not in the fixture).
- Throwaway DB `golive_rehearsal` on the local test cluster (55433).
- Seed realistic 014-era data (users incl. avatars, posts with
  image_url, likes, comments, follows, DMs incl. a voice note,
  notifications) so the backfills (017 post_media, 016 reactions) run
  on real rows.
- Run the checklist's step-3 commands EXACTLY (pre-checks, the loop,
  post-check) with $PROD_DB = the rehearsal DB.
- Check: every up succeeds; data kept (counts, 017 backfill = one
  post_media per image post, likes → reaction 'like'); the result
  matches the dev schema (tables/columns/constraints from
  information_schema vs a fresh fixture DB).
- The new backend against the migrated DB: API smoke (signup, login,
  feed incl. old posts with images, reactions, comments, DMs).
- The checklist's claim "old master code keeps working on the migrated
  schema" (rollback B): run master's backend (git worktree) against the
  migrated DB: login, feed, post, like, comment, DM.
- Rollback A path: all downs 027→015, then ups again (idempotent).

## Step 2 result (DONE)
- Reusable `e2e/golive-rehearsal.sh [--old]` + `e2e/golive-smoke.cjs`
  (picks up every migration ≥ 015 automatically, for later GO LIVEs).
- Run 2026-09-29: REHEARSAL PASSED (37 checks) —
  - 13/13 up; result = dev schema (149 columns, 91 constraints);
  - all 014-era rows kept; 017 backfill + 016 reactions correct;
  - new backend AND master backend both serve old data + new actions
    on the migrated DB (proves the migration window + rollback B);
  - rollback A: downs restore the 014 schema exactly, data kept; up
    again works.
- Positive control: a broken 027 → "FAIL up 027", REHEARSAL FAILED.
- Only expected quirk: migration 001's two old-DM indexes can't apply
  after 003 renamed that table (they live on messages_dm_legacy).
- Checklist step 0 now requires the rehearsal to pass.

## Progress
- Step 1 DONE (`490a936`). Step 2 DONE.
