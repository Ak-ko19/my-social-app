-- Migration: 061_add_community_bans (UP)
-- Purpose: Day 50 -- "Remove and ban" in a group (Facebook's): an admin
-- removes someone and they can't join or ask to join again until an admin
-- unbans them.

BEGIN;
CREATE TABLE IF NOT EXISTS community_bans (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
-- The cascade from a deleted account.
CREATE INDEX IF NOT EXISTS idx_community_bans_user ON community_bans (user_id);
COMMIT;
