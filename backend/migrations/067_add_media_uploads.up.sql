-- Migration: 067_add_media_uploads (UP)
-- Purpose: Day 57 -- a ledger of what each person uploads (one row per
-- file stored at Cloudinary), for a daily upload limit per person and the
-- admin's storage page. Rows older than 30 days are cleaned up.

BEGIN;
CREATE TABLE IF NOT EXISTS media_uploads (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(10) NOT NULL CONSTRAINT chk_media_uploads_kind CHECK (kind IN ('image', 'audio')),
  bytes BIGINT NOT NULL CONSTRAINT chk_media_uploads_bytes CHECK (bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- "What did this person upload in the last 24 hours."
CREATE INDEX IF NOT EXISTS idx_media_uploads_user_recent ON media_uploads (user_id, created_at DESC);
-- The admin's "last 24 hours" and the cleanup.
CREATE INDEX IF NOT EXISTS idx_media_uploads_created ON media_uploads (created_at);
COMMIT;
