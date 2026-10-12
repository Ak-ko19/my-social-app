-- Migration: 066_add_event_notifications (UP)
-- Purpose: Day 55 -- event notifications: a reminder an hour before to the
-- people going / interested, and the host cancelling; an "Events" switch
-- in notification settings (on by default).

BEGIN;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE;
-- The cascade when an event is deleted.
CREATE INDEX IF NOT EXISTS idx_notifications_event ON notifications (event_id) WHERE event_id IS NOT NULL;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS events BOOLEAN NOT NULL DEFAULT true;
COMMIT;
