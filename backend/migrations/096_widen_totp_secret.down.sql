-- Migration: 096_widen_totp_secret (DOWN)
-- Back to 64 characters. While any key is still sealed this FAILS (and
-- changes nothing) rather than cutting keys short: unset
-- TOTP_ENCRYPTION_KEY only after every account has turned two-factor off
-- and on again, or restore from a backup.

BEGIN;
ALTER TABLE users ALTER COLUMN totp_secret TYPE varchar(64);
ALTER TABLE users ALTER COLUMN totp_pending_secret TYPE varchar(64);
COMMIT;
