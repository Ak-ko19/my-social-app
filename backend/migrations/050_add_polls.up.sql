-- Migration: 050_add_polls (UP)
-- Purpose: Day 44 -- poll posts, like X/Facebook/LinkedIn. The post's text
-- is the question; a poll has 2-4 options and closes at a set time. Each
-- person votes once (no changing it), anonymously: only the counts are
-- ever shown. Everything goes with its post, and a person's votes with
-- their account.

BEGIN;
CREATE TABLE IF NOT EXISTS polls (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  closes_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_options (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  label VARCHAR(50) NOT NULL CHECK (btrim(label) <> ''),
  UNIQUE (post_id, position)
);
CREATE TABLE IF NOT EXISTS poll_votes (
  post_id INTEGER NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One vote per person per poll.
  PRIMARY KEY (post_id, user_id)
);
-- A person's votes (data download, account deletion's cascade).
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes (user_id);
-- The cascade from a deleted option.
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes (option_id);
COMMIT;
