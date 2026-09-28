# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 4 — Cloudinary cleanup
**Step:** 3 — Script to find and delete orphaned Cloudinary files (dry-run mode first).

## Done this Day
- Step 1 DONE (`10a7eca`): media deleted with its content (9 paths) +
  refused/partly failed uploads cleaned up.
- Step 2 DONE (`a97d547`): public_id derived from secure_url (no
  migration), verified against the real SDK.

## Carry-over notes
- Day 6 GO_LIVE_CHECKLIST.md must include:
  - after deploy, a rate-limit check from two networks (wrong logins on
    one must not lock the other), the only way to confirm Render's
    one-hop proxy setting;
  - delete a test post with a photo and check its image URL stops
    loading (Cloudinary cleanup can't be tested locally: no credentials);
  - run `npm run cloudinary:orphans` (dry run) once, then with --delete.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.

## Plan
- `backend/scripts/cloudinary-orphans.js` (`npm run cloudinary:orphans`):
  - Lists every upload in the app's own folders (posts, avatars,
    stories, message-images, voice-messages, mysocialapp) via the Admin
    API (`api.resources`, prefix per folder, image + video, paginated by
    next_cursor, 500 per page). Other folders on the same Cloudinary
    account are never listed, so never touched.
  - Referenced = public_ids parsed from users.avatar_url,
    posts.image_url, post_media.url, stories.media_url (expired rows
    still count until Day 9's job removes them), messages.media_url of
    NOT soft-deleted messages (so leftovers of deleted messages are
    found).
  - Orphan = listed, not referenced, and older than --min-age-hours
    (default 24): an upload in progress (file uploaded, row not saved
    yet) must never look orphaned.
  - Default is a DRY RUN: summary per folder + orphan count/size + the
    first 20 public_ids. `--delete` actually deletes (batches of 100,
    same helper as the app).
  - Safety guards for --delete, overridable only with --force:
    - the database has no media references but Cloudinary has files
      (looks like the wrong DATABASE_URL);
    - more than 50% of listed files would be deleted.
  - Refuses to start without DATABASE_URL + Cloudinary credentials.
    Never prints secrets.
- `mediaCleanupService`: split out `deleteAssets([{publicId,
  resourceType}])` (grouping + batching + logging, returns
  {deleted, failed}); deleteMedia() uses it.
- Testable: `run({ argv, api, db, cloud, now, log })` with injectable
  Admin API; pure `findOrphans()`.
- Tests: pagination, folders, age filter, soft-deleted message media is
  an orphan, referenced media never is, dry run deletes nothing,
  --delete deletes exactly the orphans, both guards and --force,
  missing config, argument parsing.

## Progress
- [x] deleteAssets refactor (cleanup tests still 33/33)
- [x] script + `npm run cloudinary:orphans`
- [x] tests: 8 (real test DB for references, fake paginated Admin API)
- [x] CLI wiring checked with every var explicit (e2e DB, blank
  Cloudinary; never the real .env values): exits 2 with clear messages
- [x] Backend 317/317; diff review clean
- STEP 3 DONE
