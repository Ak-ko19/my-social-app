-- Migration: 089_add_pinned_comment (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_posts_pinned_comment;
ALTER TABLE posts DROP COLUMN IF EXISTS pinned_comment_id;
COMMIT;
