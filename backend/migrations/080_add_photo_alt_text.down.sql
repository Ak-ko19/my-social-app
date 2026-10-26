-- Migration: 080_add_photo_alt_text (DOWN)

BEGIN;
ALTER TABLE post_drafts DROP COLUMN IF EXISTS media_alts;
ALTER TABLE post_media DROP COLUMN IF EXISTS alt_text;
COMMIT;
