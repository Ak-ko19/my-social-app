# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 3 — Startup safety + small bugs
**Step:** 3 — Fix the remaining Low bugs from the audit.

## Done this Day
- Step 1 DONE (`5283798`): startup env check + PORT.
- Step 2 DONE (`9945631`): frontend security headers (+ e2e dist mode).

## Carry-over notes
- Day 6 GO_LIVE_CHECKLIST.md must include: after deploy, a rate-limit
  check from two networks (wrong logins on one must not lock the other),
  the only way to confirm Render's one-hop proxy setting.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Day 4 prep (read-only): NO table stores a Cloudinary public_id. Media
  is only referenced by URL: users.avatar_url, posts.image_url,
  post_media.url, messages.media_url (voice = resource_type 'video',
  image), stories.media_url (+ check pages/communities for avatars).
  Plan: migration adding public_id (+ resource type where mixed),
  backfill by parsing public_id from existing res.cloudinary.com URLs
  (…/upload/[v123/]<public_id>.<ext>), store it on every upload
  (uploadToCloudinary already gets result.public_id).

## Plan
Audit Low bugs still open: #10, #11 (#12 was step 2).

### #10 — upload failures
- Today server.js's last error handler answers EVERY error with 400 +
  err.message: multer rejections (fine), Cloudinary failures (wrong
  status + provider text like "cloud_name is disabled" reaches users),
  the CORS rejection, and anything unexpected (400 + raw message).
- New `middleware/errorHandler.js`:
  - `clientError(msg)` → 400, message shown (file-type filters,
    too-many-images).
  - `uploadFailed(cause)` → 502 "Upload failed. Please try again
    later." (matches the frontend's "<X> failed. Please try again
    later." auto-translation); the provider's error is logged, not sent.
  - MulterError: LIMIT_FILE_SIZE → 400 "File is too large (max 5 MB)";
    other codes → 400 with multer's message (developer-facing).
  - body-parser errors (status 4xx, expose) → unchanged.
  - CORS rejection → 403 "Not allowed by CORS" (was 400).
  - Anything else → 500 generic text + full error logged.
  - `res.headersSent` → delegate to Express.
- Translations (MY + AR) for the upload messages users can hit:
  "Only JPEG, PNG, GIF, and WEBP images are allowed", "Only WEBM, MP4,
  OGG, and MPEG audio files are allowed", "File is too large (max 5 MB)",
  "You can attach up to 10 images". check:i18n enforces MY/AR parity.
- Tests (tests/api/uploadErrors.test.js): Cloudinary failure → 502 +
  generic text, provider text not leaked, on posts (many), avatar
  (single) and voice; wrong type → 400; >5 MB → 400 new text; 11 images
  → 400; CORS → 403; unexpected error → 500 generic.

### #11 — link preview URL scheme
- PostCard renders `post.linkPreview.url` as href unchecked (never
  populated today; Day 19 builds previews). New `utils/safeUrl.js`
  `safeHttpUrl(value)` → the URL if http(s), else null; the preview (and
  its image) render only with a safe URL. Verified with a node check now;
  Vitest unit test on Day 13.

## Progress
- [x] errorHandler + upload middleware (uploadMany: try now wraps only
  the upload, so a later handler's error isn't mislabelled)
- [x] translations (MY + AR, 4 upload messages)
- [x] backend tests: uploadErrors.test.js 13/13
- [x] safeUrl + PostCard; node check 16 cases OK (javascript: variants,
  data:, protocol-relative, non-strings)
- [x] Backend 289/289; lint + check:i18n (MY/AR parity) green
- [x] b2 14, b3 16, b6 13, b9 15, day2-own-post 20: all green
- [x] Real UI: a 6 MB image in the composer shows the translated
  "too large" message in EN/MY/AR and keeps the draft
- STEP 3 DONE
