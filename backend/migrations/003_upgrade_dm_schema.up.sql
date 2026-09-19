-- Migration: 003_upgrade_dm_schema (UP)
-- Purpose: Replace the flat sender_id/receiver_id `messages` table with a
-- conversation-based schema so DMs can support read receipts, edit/soft-delete,
-- optimistic-UI matching (client_temp_id), and group conversations later
-- without another structural rewrite.
--
-- Unlike 001/002, this migration creates brand-new, empty tables (no live
-- traffic on them yet), so CREATE INDEX runs plain (non-CONCURRENTLY) and the
-- whole thing is wrapped in a transaction for atomicity -- if anything fails,
-- nothing is left half-migrated and the original `messages` table is untouched.
--
-- Data safety: the legacy DM table is renamed to messages_dm_legacy, not
-- dropped. It is left in place after this migration for verification /
-- rollback and should only be dropped manually in a later cleanup migration
-- once the new schema has been running in production without issues.
--
-- IMPORTANT (app-layer note): conversations.user_a_id/user_b_id must always be
-- inserted as (LEAST(id1, id2), GREATEST(id1, id2)) -- the CHECK constraint
-- below rejects anything else. Any "find or create direct conversation"
-- application code must normalize the pair the same way before INSERT.

BEGIN;

-- 1. Preserve the old table under a new name instead of dropping it.
ALTER TABLE messages RENAME TO messages_dm_legacy;

-- 2. Enum types
CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read');

-- 3. conversations
-- user_a_id/user_b_id are only populated for type = 'direct' and are always
-- stored in canonical (smaller id, larger id) order -- that's what lets a
-- single unique index below dedupe direct conversations between two users.
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  type conversation_type NOT NULL DEFAULT 'direct',
  user_a_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_b_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_conversations_direct_pair_order CHECK (
    type <> 'direct'
    OR (user_a_id IS NOT NULL AND user_b_id IS NOT NULL AND user_a_id < user_b_id)
  )
);

-- Prevents creating a second direct conversation for the same two users.
CREATE UNIQUE INDEX idx_conversations_direct_unique_pair
  ON conversations (user_a_id, user_b_id)
  WHERE type = 'direct';

-- 4. messages (new)
-- legacy_id is a temporary bridge column used only by this migration's data
-- copy below (step 8) to backfill last_read_message_id without relying on
-- timestamp matching. It is dropped at the end of this migration (step 10)
-- and is not part of the final schema.
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  status message_status NOT NULL DEFAULT 'sent',
  client_temp_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  legacy_id INTEGER
);

-- Cursor-based pagination: fetch a conversation's messages newest-first in pages.
CREATE INDEX idx_messages_conversation_created_at ON messages (conversation_id, created_at DESC);

-- Speeds up the legacy_id join in step 9; dropped along with the column in step 10.
CREATE INDEX idx_messages_legacy_id ON messages (legacy_id);

-- 5. conversation_participants
CREATE TABLE conversation_participants (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  PRIMARY KEY (conversation_id, user_id)
);

-- 6. Data migration: one conversation per unique unordered (sender, receiver) pair.
INSERT INTO conversations (type, user_a_id, user_b_id, created_at)
SELECT 'direct', LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), MIN(created_at)
FROM messages_dm_legacy
GROUP BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id);

-- 7. Both users of every direct conversation become participants.
INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
SELECT c.id, c.user_a_id, c.created_at FROM conversations c
UNION ALL
SELECT c.id, c.user_b_id, c.created_at FROM conversations c;

-- 8. Copy every legacy message into its matching conversation.
-- is_read has no "delivered" concept in the old schema, so unread legacy
-- messages map to 'sent' (the safe/conservative default) and read ones map to 'read'.
INSERT INTO messages (conversation_id, sender_id, content, status, created_at, legacy_id)
SELECT
  c.id,
  m.sender_id,
  m.content,
  CASE WHEN m.is_read THEN 'read'::message_status ELSE 'sent'::message_status END,
  m.created_at,
  m.id
FROM messages_dm_legacy m
JOIN conversations c
  ON c.type = 'direct'
 AND c.user_a_id = LEAST(m.sender_id, m.receiver_id)
 AND c.user_b_id = GREATEST(m.sender_id, m.receiver_id);

-- 9. Backfill last_read_message_id: for each participant, the newest message
-- addressed to them (i.e. sent by the other user) that was is_read = true
-- in the legacy table.
UPDATE conversation_participants cp
SET last_read_message_id = latest_read.new_message_id
FROM (
  SELECT DISTINCT ON (cp2.conversation_id, cp2.user_id)
    cp2.conversation_id, cp2.user_id, nm.id AS new_message_id
  FROM conversation_participants cp2
  JOIN messages_dm_legacy lm
    ON lm.receiver_id = cp2.user_id
   AND lm.is_read = true
  JOIN messages nm
    ON nm.legacy_id = lm.id
   AND nm.conversation_id = cp2.conversation_id
  ORDER BY cp2.conversation_id, cp2.user_id, lm.created_at DESC
) latest_read
WHERE cp.conversation_id = latest_read.conversation_id
  AND cp.user_id = latest_read.user_id;

-- 10. Drop the temporary bridge column now that the backfill is done.
DROP INDEX idx_messages_legacy_id;
ALTER TABLE messages DROP COLUMN legacy_id;

-- 11. Verify no rows were lost in the copy. Aborts (and rolls back the whole
-- transaction) if the counts don't match.
DO $$
DECLARE
  old_count INTEGER;
  new_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_count FROM messages_dm_legacy;
  SELECT COUNT(*) INTO new_count FROM messages;
  IF old_count <> new_count THEN
    RAISE EXCEPTION 'Row count mismatch after DM migration: legacy=%, new=%', old_count, new_count;
  END IF;
  RAISE NOTICE 'DM migration verified: % legacy rows -> % new rows', old_count, new_count;
END $$;

COMMIT;
