-- Migration: 081_add_chat_pin_archive (DOWN)

BEGIN;
ALTER TABLE conversation_participants DROP COLUMN IF EXISTS archived_at;
ALTER TABLE conversation_participants DROP COLUMN IF EXISTS pinned_at;
COMMIT;
