-- Migration: 068_add_daily_stats (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_reports_created_at;
DROP INDEX IF EXISTS idx_comments_created_at;
DROP INDEX IF EXISTS idx_users_created_at;
DROP TABLE IF EXISTS daily_stats;
COMMIT;
