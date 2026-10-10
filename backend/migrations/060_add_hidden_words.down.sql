-- Migration: 060_add_hidden_words (DOWN)

BEGIN;
DROP TABLE IF EXISTS user_hidden_words;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_hidden_words_mode;
ALTER TABLE users DROP COLUMN IF EXISTS hidden_words_mode;
COMMIT;
