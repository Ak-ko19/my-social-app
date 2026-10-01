-- Migration: 033_add_user_language (DOWN)
-- Each browser keeps its own choice in local storage, so nothing is lost
-- on the device; only the "follows you to new devices" part goes away.
BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_language;
ALTER TABLE users DROP COLUMN IF EXISTS language;
COMMIT;
