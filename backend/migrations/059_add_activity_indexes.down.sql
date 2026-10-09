-- Migration: 059_add_activity_indexes (DOWN)

BEGIN;
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);
DROP INDEX IF EXISTS idx_comments_user_recent;
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes (user_id);
DROP INDEX IF EXISTS idx_comment_likes_user_recent;
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes (user_id);
DROP INDEX IF EXISTS idx_likes_user_recent;
COMMIT;
