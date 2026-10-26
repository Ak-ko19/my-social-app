-- Migration: 082_add_story_replies (UP)
-- Purpose: Day 100 -- reply to a story, or react to it with an emoji
-- (Instagram). Either one is a direct message to the story's author with
-- the story attached.
--   messages.story_id: the story it answers; NULL once the story is gone
--     (expired stories are deleted an hour after expiry).
--   messages.story_reply: 'reply' or 'reaction'; kept after the story is
--     gone, so the chat still says what the message was.
--   idx_messages_story_id: the SET NULL when a story is deleted (the
--     cleanup job deletes them in batches).

BEGIN;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_id integer REFERENCES stories(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_reply text;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS chk_messages_story_reply;
ALTER TABLE messages ADD CONSTRAINT chk_messages_story_reply CHECK (story_reply IN ('reply', 'reaction'));
CREATE INDEX IF NOT EXISTS idx_messages_story_id ON messages (story_id) WHERE story_id IS NOT NULL;
COMMIT;
