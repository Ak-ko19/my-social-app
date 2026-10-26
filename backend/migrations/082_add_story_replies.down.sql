-- Migration: 082_add_story_replies (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_messages_story_id;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS chk_messages_story_reply;
ALTER TABLE messages DROP COLUMN IF EXISTS story_reply;
ALTER TABLE messages DROP COLUMN IF EXISTS story_id;
COMMIT;
