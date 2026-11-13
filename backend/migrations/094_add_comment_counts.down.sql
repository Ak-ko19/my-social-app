-- Migration: 094_add_comment_counts (DOWN)
-- Back to counting a comment's reactions and replies per request.

BEGIN;

DROP TRIGGER IF EXISTS trg_comments_reply_count_ins ON comments;
DROP TRIGGER IF EXISTS trg_comments_reply_count_del ON comments;
DROP TRIGGER IF EXISTS trg_comments_reply_count_upd ON comments;
DROP FUNCTION IF EXISTS comment_reply_count_sync();

DROP TRIGGER IF EXISTS trg_comment_likes_count_ins ON comment_likes;
DROP TRIGGER IF EXISTS trg_comment_likes_count_del ON comment_likes;
DROP FUNCTION IF EXISTS comment_like_count_sync();

ALTER TABLE comments DROP COLUMN IF EXISTS reply_count;
ALTER TABLE comments DROP COLUMN IF EXISTS like_count;

COMMIT;
