-- Migration: 037_add_message_notification_settings (UP)
-- Purpose: Day 23 -- control message notifications (pushes, Day 22):
--   notification_preferences.messages: all message notifications on/off;
--   conversation_participants.muted_until: mute one chat. NULL = not muted,
--     'infinity' = until the person turns it back on.

BEGIN;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS messages boolean NOT NULL DEFAULT true;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS muted_until timestamptz;
COMMIT;
