-- Migration: 023_add_group_chats (UP)
-- Purpose: B10 group chat. The schema was already mostly group-capable:
-- conversation_type has had 'group' since the DM upgrade (003), and
-- conversation_participants is a real many-to-many table. What groups
-- still need is a name, who created them, and member roles.
--
-- Existing direct conversations: name/created_by stay NULL and every
-- participant defaults to 'member' -- roles only mean something in groups.

BEGIN;

ALTER TABLE conversations
  ADD COLUMN name VARCHAR(100),
  ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversations ADD CONSTRAINT chk_conversations_group_name
  CHECK (type <> 'group' OR (name IS NOT NULL AND length(btrim(name)) > 0));

ALTER TABLE conversation_participants
  ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'member'
  CONSTRAINT chk_participants_role CHECK (role IN ('admin', 'member'));

COMMIT;
