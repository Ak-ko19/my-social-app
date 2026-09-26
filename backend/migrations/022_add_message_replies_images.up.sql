-- Migration: 022_add_message_replies_images (UP)
-- Purpose: B9 DM extras -- reply-to + image messages (step 2 of 2; needs
-- 021's enum value). Message *editing* needs no schema change: the
-- edited_at column already exists (added with the DM schema upgrade, 003)
-- but was never written until now.
--
-- reply_to_message_id: the message being replied to, in the same
-- conversation (enforced by the API). ON DELETE SET NULL -- a hard-deleted
-- original just leaves "reply to a message that no longer exists"; soft
-- deletes (deleted_at) keep the link and the preview shows it as deleted.

BEGIN;

ALTER TABLE messages
  ADD COLUMN reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX idx_messages_reply_to ON messages (reply_to_message_id);

-- Image messages carry media_url; content is an optional caption.
ALTER TABLE messages DROP CONSTRAINT chk_messages_type_fields;
ALTER TABLE messages ADD CONSTRAINT chk_messages_type_fields CHECK (
  (type = 'text' AND content IS NOT NULL AND content <> '')
  OR
  (type = 'voice' AND media_url IS NOT NULL AND duration_seconds IS NOT NULL)
  OR
  (type = 'image' AND media_url IS NOT NULL)
);

COMMIT;
