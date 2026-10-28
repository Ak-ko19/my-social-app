-- Migration: 087_add_hashtag_follows (UP)
-- Purpose: Days 107-108 -- follow a hashtag (Instagram-style): its public
-- posts come to your Home. At most 200 per account (the API checks), which
-- also bounds the Home query.
--   PK (user_id, hashtag_id): your tags, and "do you follow this one".
--   idx_hashtag_follows_hashtag: a tag's followers (and the cascade when a
--     hashtag row goes).

BEGIN;
CREATE TABLE IF NOT EXISTS hashtag_follows (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hashtag_id integer NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hashtag_id)
);
CREATE INDEX IF NOT EXISTS idx_hashtag_follows_hashtag ON hashtag_follows (hashtag_id);
COMMIT;
