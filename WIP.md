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

## Progress
- Step 1 DONE; next: step 2 (test migrations 015–027 on a fresh DB with
  the production schema, i.e. master @ 014).
