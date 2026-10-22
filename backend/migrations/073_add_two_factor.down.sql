-- Migration: 073_add_two_factor (DOWN)

BEGIN;
DROP TABLE IF EXISTS recovery_codes;
ALTER TABLE users DROP COLUMN IF EXISTS totp_failures_since;
ALTER TABLE users DROP COLUMN IF EXISTS totp_failures;
ALTER TABLE users DROP COLUMN IF EXISTS totp_last_step;
ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled_at;
ALTER TABLE users DROP COLUMN IF EXISTS totp_pending_secret;
ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
COMMIT;
