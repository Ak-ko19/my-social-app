-- Migration: 010_add_hashtags (UP)
-- Purpose: #hashtag support. A normalized hashtags registry (one row per
-- unique tag, lowercase) plus a post_hashtags join table, rather than a
-- tags TEXT[] column on posts -- a real join lets "posts for this tag"
-- (the hashtag feed) run as an ordinary indexed join/filter instead of an
-- array-contains scan, and keeps the tag itself canonical in one place
-- (case-insensitive matching, a future "trending tags" query, etc.).

BEGIN;

CREATE TABLE hashtags (
  id SERIAL PRIMARY KEY,
  tag VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: #JavaScript and #javascript are the same tag.
CREATE UNIQUE INDEX idx_hashtags_tag_lower ON hashtags (LOWER(tag));

CREATE TABLE post_hashtags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

-- The hashtag feed's access pattern: given a hashtag_id, find its posts
-- (join to posts, order by posts.created_at DESC). The PK above already
-- covers post_id-first lookups (re-deriving a post's own tags); this
-- covers the reverse direction.
CREATE INDEX idx_post_hashtags_hashtag_id ON post_hashtags (hashtag_id);

COMMIT;
