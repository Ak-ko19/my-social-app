-- Migration: 051_drop_myanmar_ui_language (DOWN)
-- Allows 'my' again (the 033 constraint). Accounts moved to English stay
-- English: which ones had Myanmar isn't kept, and they can re-pick it.

BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_language;
ALTER TABLE users ADD CONSTRAINT chk_users_language CHECK (language IN ('en', 'my', 'ar'));
COMMIT;
