-- Migration: 023_add_group_chats (DOWN)
-- Group conversations can't exist without their name/roles, so they (and,
-- by cascade, their participants and messages) are removed first.
BEGIN;
DELETE FROM conversations WHERE type = 'group';
ALTER TABLE conversation_participants DROP COLUMN IF EXISTS role;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS chk_conversations_group_name;
ALTER TABLE conversations DROP COLUMN IF EXISTS created_by;
ALTER TABLE conversations DROP COLUMN IF EXISTS name;
COMMIT;
