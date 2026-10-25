-- Migration: 077_add_memories_notifications (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_posts_month_day;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS memories;
ALTER TABLE users DROP COLUMN IF EXISTS time_zone;
COMMIT;
