-- Migration: 016_add_reactions (DOWN)
-- Drops the reaction type; every reaction collapses back to a plain like.
BEGIN;
ALTER TABLE likes DROP COLUMN IF EXISTS reaction;
COMMIT;
