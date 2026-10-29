-- Migration: 088_add_comment_thread_indexes (DOWN)

BEGIN;
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments (parent_comment_id);
DROP INDEX IF EXISTS idx_comments_replies;
DROP INDEX IF EXISTS idx_comments_top;
COMMIT;
