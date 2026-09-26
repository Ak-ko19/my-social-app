-- Migration: 019_add_comment_replies_likes (DOWN)
-- Replies survive as ordinary top-level comments once the column is gone.
BEGIN;
DROP TABLE IF EXISTS comment_likes;
DROP INDEX IF EXISTS idx_comments_parent_comment_id;
ALTER TABLE comments DROP COLUMN IF EXISTS parent_comment_id;
COMMIT;
