-- Migration: 033_add_user_language (UP)
-- Purpose: Day 16 -- the app language is saved per account, so it follows
-- the person to every device they log in on (it used to live only in one
-- browser's local storage). NULL = never chosen; the device's language
-- is then used, and saved here on the next login.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language varchar(5);
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_language;
ALTER TABLE users ADD CONSTRAINT chk_users_language CHECK (language IN ('en', 'my', 'ar'));
COMMIT;
