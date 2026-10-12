-- Migration: 066_add_event_notifications (DOWN)
-- The event notifications go (older code can't show them).

BEGIN;
DELETE FROM notifications WHERE type IN ('event_reminder', 'event_cancelled');
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS events;
DROP INDEX IF EXISTS idx_notifications_event;
ALTER TABLE notifications DROP COLUMN IF EXISTS event_id;
COMMIT;
