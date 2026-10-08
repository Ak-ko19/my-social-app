-- Migration: 056_add_user_restrictions (UP)
-- Purpose: Day 47 -- restrict a person (Instagram's "Restrict"): their new
-- comments on your posts are seen only by them and you until you approve
-- them, and they can't send you notifications. They are never told.

BEGIN;
CREATE TABLE IF NOT EXISTS user_restrictions (
  restricter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restricted_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restricter_id, restricted_id),
  CONSTRAINT chk_user_restrictions_not_self CHECK (restricter_id <> restricted_id)
);
CREATE INDEX IF NOT EXISTS idx_user_restrictions_restricted ON user_restrictions (restricted_id);
-- A restricted person's comment on your post, waiting for your approval.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS awaiting_approval BOOLEAN NOT NULL DEFAULT false;
COMMIT;
