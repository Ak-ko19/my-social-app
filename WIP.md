# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 4 — Cloudinary cleanup (not started)
**Step:** —

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
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.

## Plan
(written at the start of each step)

## Progress
(nothing in progress — Day 3 closed 2026-09-28)
