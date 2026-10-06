-- Migration: 042_add_group_photo (DOWN)
-- Groups go back to the glyph. (Their photo files stay on Cloudinary; the
-- orphan scan, scripts/cloudinary-orphans.js, finds and removes them.)
BEGIN;
ALTER TABLE conversations DROP COLUMN IF EXISTS avatar_url;
COMMIT;
