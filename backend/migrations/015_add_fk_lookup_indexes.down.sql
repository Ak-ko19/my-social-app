-- Migration: 015_add_fk_lookup_indexes (DOWN)
BEGIN;
DROP INDEX IF EXISTS idx_bookmarks_post_id;
DROP INDEX IF EXISTS idx_messages_sender_id;
DROP INDEX IF EXISTS idx_notifications_actor_id;
DROP INDEX IF EXISTS idx_likes_user_id;
DROP INDEX IF EXISTS idx_comments_user_id;
DROP INDEX IF EXISTS idx_conversation_participants_user_id;
COMMIT;
