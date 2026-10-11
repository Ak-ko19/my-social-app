-- Migration: 062_add_group_notifications (DOWN)
-- The group notifications go (older code can't show them).

BEGIN;
DELETE FROM notifications WHERE type IN ('group_request', 'group_approved');
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS groups;
DROP INDEX IF EXISTS idx_notifications_community;
ALTER TABLE notifications DROP COLUMN IF EXISTS community_id;
COMMIT;
