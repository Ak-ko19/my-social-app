-- Migration: 017_add_post_media (UP)
-- Purpose: B2 multiple images per post. One row per image, ordered by
-- `position` (0 = first/cover). Backfills every existing single-image post
-- as position 0, so old posts show up in the carousel unchanged.
--
-- posts.image_url is deliberately KEPT and still written (mirroring the
-- first image) rather than dropped: an already-deployed frontend, search
-- results and any other reader of image_url keep working during and after
-- the rollout. post_media is the source of truth for the full list.

BEGIN;

CREATE TABLE post_media (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position SMALLINT NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Also serves every "media for this post, in order" lookup (post_id is
  -- the leading column), so no separate post_id index is needed.
  UNIQUE (post_id, position)
);

INSERT INTO post_media (post_id, url, position)
SELECT id, image_url, 0 FROM posts WHERE image_url IS NOT NULL;

COMMIT;
