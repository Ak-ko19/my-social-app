-- Migration: 055_add_user_mutes (UP)
-- Purpose: Day 47 -- mute a person (Facebook's "snooze", Instagram's
-- "mute"): their posts and stories stop showing in your Home feed, stories
-- and Explore, without unfollowing. They are never told.

BEGIN;
CREATE TABLE IF NOT EXISTS user_mutes (
  muter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CONSTRAINT chk_user_mutes_not_self CHECK (muter_id <> muted_id)
);
-- An account's deletion cascades from the muted side too.
CREATE INDEX IF NOT EXISTS idx_user_mutes_muted ON user_mutes (muted_id);
COMMIT;
