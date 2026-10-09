-- Migration: 059_add_activity_indexes (UP)
-- Purpose: Day 48 -- the activity log lists a person's likes, comment likes
-- and comments newest first. The (user_id) indexes become (user_id,
-- created_at DESC): the same lookups by person, plus the order, with one
-- index per table to keep up to date instead of two.

BEGIN;
CREATE INDEX IF NOT EXISTS idx_likes_user_recent ON likes (user_id, created_at DESC);
DROP INDEX IF EXISTS idx_likes_user_id;
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_recent ON comment_likes (user_id, created_at DESC);
DROP INDEX IF EXISTS idx_comment_likes_user_id;
CREATE INDEX IF NOT EXISTS idx_comments_user_recent ON comments (user_id, created_at DESC);
DROP INDEX IF EXISTS idx_comments_user_id;
COMMIT;
