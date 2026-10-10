-- Migration: 060_add_hidden_words (UP)
-- Purpose: Day 49 -- Hidden words (Instagram's): what a person does with
-- posts and comments that contain offensive words (a built-in English /
-- Arabic list, plus words they add): warn (covered, "Show anyway"), hide,
-- or off. Only changes what that person sees; nobody is stopped from
-- writing anything.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_words_mode varchar(4) NOT NULL DEFAULT 'warn';
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_hidden_words_mode;
ALTER TABLE users ADD CONSTRAINT chk_users_hidden_words_mode CHECK (hidden_words_mode IN ('off', 'warn', 'hide'));

CREATE TABLE IF NOT EXISTS user_hidden_words (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word varchar(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word),
  CONSTRAINT chk_user_hidden_words_length CHECK (char_length(word) BETWEEN 1 AND 40)
);
COMMIT;
