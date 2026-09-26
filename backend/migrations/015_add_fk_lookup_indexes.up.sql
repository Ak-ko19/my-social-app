-- Migration: 015_add_fk_lookup_indexes (UP)
-- Purpose: A6 index review (2026-09-24). Adds indexes for lookups that
-- the existing composite keys can't serve because the column isn't the
-- key's leading column:
--
--   conversation_participants(user_id) -- "which conversations am I in":
--     runs on EVERY socket connection (sockets/index.js room join) and
--     every inbox load (GET /conversations). The PK is
--     (conversation_id, user_id), so this was a full scan.
--
-- plus the foreign keys that ON DELETE CASCADE walks when an account or a
-- post is deleted (Postgres does NOT index FK columns automatically, so
-- each cascade was a full scan of the child table):
--   comments.user_id, likes.user_id, notifications.actor_id,
--   messages.sender_id  -> account deletion (migration 013's cascade)
--   bookmarks.post_id    -> post deletion (the unique index is (user_id, post_id))
--
-- Plain (non-CONCURRENTLY) indexes inside one transaction, same reasoning
-- as 014: scripts/run-migration.js sends the file as one multi-statement
-- query, which Postgres runs as an implicit transaction, and CONCURRENTLY
-- can't run inside one. At current table sizes the brief write lock is a
-- non-issue. IF NOT EXISTS keeps it safe to re-run.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id ON notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post_id ON bookmarks (post_id);

COMMIT;
