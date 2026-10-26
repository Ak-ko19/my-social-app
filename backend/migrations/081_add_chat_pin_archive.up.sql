-- Migration: 081_add_chat_pin_archive (UP)
-- Purpose: Days 97-98 -- pin chats to the top of your inbox and archive
-- them (Messenger / WhatsApp). Per person, on their participant row.
--   pinned_at: when you pinned it (pinned chats come first, the most
--     recently pinned first); NULL = not pinned.
--   archived_at: when you archived it (out of the inbox, in "Archived
--     chats"); NULL = in the inbox.

BEGIN;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS archived_at timestamptz;
COMMIT;
