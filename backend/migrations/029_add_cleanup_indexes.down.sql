-- Migration: 029_add_cleanup_indexes (DOWN)
BEGIN;
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_notifications_created_at;
DROP INDEX IF EXISTS idx_stories_expires_at;
COMMIT;
