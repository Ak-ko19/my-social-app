-- Migration: 039_add_performance_indexes (DOWN)
-- Indexes only: dropping them loses no data, just speed. Puts back 010's
-- hashtag index, which the up replaced.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_id ON post_hashtags (hashtag_id);
DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_post_hashtags_hashtag;
DROP INDEX IF EXISTS idx_participants_last_read;
DROP INDEX IF EXISTS idx_story_views_viewer;
COMMIT;
