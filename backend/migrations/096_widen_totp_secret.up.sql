-- Migration: 096_widen_totp_secret (UP)
-- Purpose: Days 114-115 -- two-factor keys can be stored sealed
-- (utils/secretBox.js, when TOTP_ENCRYPTION_KEY is set). A sealed key is
-- "v1:<iv>:<tag>:<data>", 86 characters for the 32-character key, so both
-- columns grow to 128. Values already there are unchanged.

BEGIN;
ALTER TABLE users ALTER COLUMN totp_secret TYPE varchar(128);
ALTER TABLE users ALTER COLUMN totp_pending_secret TYPE varchar(128);
COMMIT;
