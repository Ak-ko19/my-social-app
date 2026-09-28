# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 4 — Cloudinary cleanup
**Step:** 1 — Deleting a post, story, message, or account deletes its images/voice notes from Cloudinary.
(Step 2, "store public_id wherever missing", is decided here too — see below.)

## Carry-over notes
- Day 6 GO_LIVE_CHECKLIST.md must include: after deploy, a rate-limit
  check from two networks (wrong logins on one must not lock the other),
  the only way to confirm Render's one-hop proxy setting.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.

## Plan
### public_id: derive, don't store (better than a migration)
- Every upload stores Cloudinary's raw `secure_url` (post images, avatars,
  stories, DM images, voice). Those URLs always contain resource type,
  version and public_id:
  `https://res.cloudinary.com/<cloud>/<image|video>/upload/v<n>/<public_id>.<ext>`
- One tested parser gives {publicId, resourceType} for every existing
  and future row: no migration, no backfill on a production DB that is
  already 13 migrations behind, no second copy that could drift.
- Only URLs on OUR cloud (CLOUDINARY_CLOUD_NAME) are ever deleted.
  Anything else (other clouds, test fixtures, relative paths) is skipped.

### services/mediaCleanupService.js
- `cloudinaryAsset(url)` → { publicId, resourceType } | null
- `deleteMedia(urls)`: dedupe → parse → group by resource type → batches
  of 100 via `cloudinary.api.delete_resources(ids, { resource_type,
  type: 'upload', invalidate: true })` (invalidate = CDN copies stop
  serving too, which is the privacy point). No-op unless Cloudinary is
  fully configured (local dev, tests, e2e). Never throws: failures are
  logged (the orphan script in step 3 catches leftovers).
- Callers read the media URLs BEFORE the DB delete, then fire-and-forget
  cleanup AFTER the delete succeeds (no added latency, never deletes
  media of a row that wasn't deleted).
- SQL helpers:
  - `postMediaUrls(where)`: posts.image_url ∪ post_media.url
  - account: avatar, own posts (incl. page and group posts), stories,
    sent messages with media
  - community: all posts in it (other people's too; FK cascade)
  - page: its posts
  - group chat deleted (last member left): its messages' media

### Call sites
- DELETE /posts/:id; admin "remove post"; DELETE /stories/:id; message
  delete (REST + socket, both via messageService soft delete; row kept,
  CHECK needs media_url, API already scrubs it); last member leaves a
  group chat; DELETE /communities/:id; DELETE /pages/:id;
  DELETE /profile (account); avatar replaced (PUT /profile with a new
  avatar → old one deleted).
- Expired stories: Day 9 cleanup job (will reuse this service).

### Tests
- Parser unit tests: image/video, folders, version, extension, other
  cloud, transformations, junk, null.
- setupTestApp's Cloudinary mock: realistic URLs
  (`/<resource_type>/upload/v1700000000/<folder>/imgN.<ext>`) +
  `api.delete_resources` jest.fn.
- API tests per call site: right public_ids + resource types deleted,
  other users' media untouched, nothing deleted when the delete is
  refused (403/404), not configured → no call, provider failure → the
  delete still succeeds (logged).

## Progress
- [x] service + parser
- [x] test mock update (realistic URLs + api.delete_resources)
- [x] call sites (9): post, admin remove, story, message (REST+socket
  share messageService), account, avatar replaced, page, community (last
  member leaves), group chat (last member leaves)
- [x] Better than planned: upload middleware deletes the just-uploaded
  files when the request ends 4xx (refused post, taken username, not a
  member, ...); a partly failed multi-image upload deletes the images
  that did upload. 5xx left to the orphan scan (row may exist).
- [x] tests: mediaCleanup 18 + uploadErrors +1 (partial failure);
  mutation-checked (account cleanup, refused-upload cleanup)
- [x] No code copies media URLs between rows, so a delete can't break
  something still in use
- [x] Backend 308/308; b2 b3 b9 b11 b13 b14 green
- STEP 1 DONE
