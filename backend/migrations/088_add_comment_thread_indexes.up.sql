-- Migration: 088_add_comment_thread_indexes (UP)
-- Purpose: Days 109-110 -- comments are listed by thread: a post's
-- top-level comments (Newest: by id; Most relevant: ranked), then each
-- thread's replies oldest first, a page at a time.
--   idx_comments_top: a post's top-level comments by id.
--   idx_comments_replies: a comment's replies by id. It replaces
--     idx_comments_parent_comment_id (same leading column, which is what
--     the cascade on delete needs).

BEGIN;
CREATE INDEX IF NOT EXISTS idx_comments_top ON comments (post_id, id) WHERE parent_comment_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_replies ON comments (parent_comment_id, id);
DROP INDEX IF EXISTS idx_comments_parent_comment_id;
COMMIT;
