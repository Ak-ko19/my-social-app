-- Migration: 040_add_message_reactions (DOWN)
-- Drops message reactions (the messages themselves are untouched).
BEGIN;
DROP TABLE IF EXISTS message_reactions;
COMMIT;
