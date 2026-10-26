-- Migration: 080_add_photo_alt_text (UP)
-- Purpose: Day 95 -- a description you write for each photo you post (alt
-- text), read by screen readers instead of the automatic "Photo 1 of 3".
--   post_media.alt_text: up to 1000 characters; NULL = none.
--   post_drafts.media_alts: the same for a draft's photos, in media_urls'
--     order (an older draft's missing entries mean none).

BEGIN;
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS alt_text text
  CONSTRAINT chk_post_media_alt_text CHECK (char_length(alt_text) <= 1000);
ALTER TABLE post_drafts ADD COLUMN IF NOT EXISTS media_alts text[] NOT NULL DEFAULT '{}';
COMMIT;
