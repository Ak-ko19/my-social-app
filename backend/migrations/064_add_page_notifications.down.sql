-- Migration: 064_add_page_notifications (DOWN)
-- The page notifications go (older code can't show them).

BEGIN;
DELETE FROM notifications WHERE type = 'page_admin';
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS pages;
DROP INDEX IF EXISTS idx_notifications_page;
ALTER TABLE notifications DROP COLUMN IF EXISTS page_id;
COMMIT;
