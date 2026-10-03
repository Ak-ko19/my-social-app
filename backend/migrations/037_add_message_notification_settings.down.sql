-- Migration: 037_add_message_notification_settings (DOWN)
-- Older code sends message pushes to everyone again (nothing private leaks).
BEGIN;
ALTER TABLE conversation_participants DROP COLUMN IF EXISTS muted_until;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS messages;
COMMIT;
