-- Migration: 041_add_message_forwarded (DOWN)
-- Forwarded messages stay; they just lose their "Forwarded" label.
BEGIN;
ALTER TABLE messages DROP COLUMN IF EXISTS is_forwarded;
COMMIT;
