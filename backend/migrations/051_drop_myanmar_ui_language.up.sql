-- Migration: 051_drop_myanmar_ui_language (UP)
-- Purpose: owner decision 2026-10-07 -- the app's UI languages are English
-- and Arabic only. Accounts that had chosen Myanmar ('my') fall back to
-- English, and the CHECK no longer allows 'my'. People can still write in
-- any language; this is only the language of the app's own text.

BEGIN;
UPDATE users SET language = 'en' WHERE language = 'my';
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_language;
ALTER TABLE users ADD CONSTRAINT chk_users_language CHECK (language IN ('en', 'ar'));
COMMIT;
