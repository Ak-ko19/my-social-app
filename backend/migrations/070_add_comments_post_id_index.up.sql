-- Migration: 070_add_comments_post_id_index (UP)
-- Purpose: Day 70 -- a post's comments come a page at a time, in id order
-- (ids are handed out as comments are created): WHERE post_id = $1 AND
-- id > $cursor ORDER BY id LIMIT n reads just that page from this index.

BEGIN;
CREATE INDEX IF NOT EXISTS idx_comments_post_id_id ON comments (post_id, id);
COMMIT;
