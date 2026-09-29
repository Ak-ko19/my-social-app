-- Migration: 029_add_cleanup_indexes (UP)
-- Purpose: Day 9 cleanup job (services/cleanupService.js). Its deletes scan
-- by time across ALL users ("stories that expired", "notifications older
-- than 90 days", "sessions that expired"); the existing indexes lead with
-- user_id, so without these each daily run would read the whole table.
-- Plain (non-CONCURRENTLY) indexes in one transaction, same reasoning as
-- 015: scripts/run-migration.js runs a file as one implicit transaction.

BEGIN;
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
COMMIT;
