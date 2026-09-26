-- Migration: 022_add_message_replies_images (DOWN)
-- Image messages can't satisfy the old CHECK, so they're removed first.
BEGIN;
DELETE FROM messages WHERE type = 'image';
ALTER TABLE messages DROP CONSTRAINT chk_messages_type_fields;
ALTER TABLE messages ADD CONSTRAINT chk_messages_type_fields CHECK (
  (type = 'text' AND content IS NOT NULL AND content <> '')
  OR
  (type = 'voice' AND media_url IS NOT NULL AND duration_seconds IS NOT NULL)
);
DROP INDEX IF EXISTS idx_messages_reply_to;
ALTER TABLE messages DROP COLUMN IF EXISTS reply_to_message_id;
COMMIT;
