-- Migration: 024_add_notification_preferences (DOWN)
-- Everyone goes back to receiving every notification.
BEGIN;
DROP TABLE IF EXISTS notification_preferences;
COMMIT;
