-- Migration: 040_add_message_reactions (UP)
-- Purpose: Day 31 -- react to a message (like Messenger): one reaction per
-- person per message, the same six as posts (keep in sync with migration
-- 016's CHECK and services/reactionService.js REACTIONS). Unsending a
-- message removes its reactions (services/messageService.js).

BEGIN;
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction VARCHAR(10) NOT NULL
    CONSTRAINT chk_message_reactions_reaction CHECK (reaction IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
-- The PK covers "reactions on these messages"; this one covers deleting
-- an account (the user_id cascade).
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions (user_id);
COMMIT;
