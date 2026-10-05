-- Migration: 039_add_performance_indexes (UP)
-- Purpose: Day 27 -- the indexes still missing after 001-038, found with
-- e2e/day27-perf.cjs (about a million seeded rows; an endpoint fails if it
-- makes Postgres read a big table end to end, or read over 20k rows):
--
--   messages(conversation_id, id) -- the inbox's unread counts ("messages
--     after the last one I read" is a range of ids in one conversation).
--     003's (conversation_id, created_at) can't bound an id range, so each
--     conversation's whole history was read on every inbox load.
--   post_hashtags(hashtag_id, post_id) -- a tag's page newest first reads
--     only the rows it shows (hashtagController orders by post id); it
--     replaces 010's idx_post_hashtags_hashtag_id (hashtag_id), which it
--     covers.
--   conversation_participants(last_read_message_id),
--   story_views(viewer_id) -- foreign keys walked by ON DELETE SET NULL /
--     CASCADE when a message or an account is deleted.
--
-- Plain (non-CONCURRENTLY) indexes in one transaction, same reasoning as
-- 015: CONCURRENTLY can't run inside one, and at current table sizes the
-- brief write lock is a non-issue. IF NOT EXISTS keeps it safe to re-run.

BEGIN;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag ON post_hashtags (hashtag_id, post_id);
DROP INDEX IF EXISTS idx_post_hashtags_hashtag_id;
CREATE INDEX IF NOT EXISTS idx_participants_last_read ON conversation_participants (last_read_message_id) WHERE last_read_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON story_views (viewer_id);
COMMIT;
