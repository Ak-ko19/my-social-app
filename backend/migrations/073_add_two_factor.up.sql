-- Migration: 073_add_two_factor (UP)
-- Purpose: Day 77 -- two-factor authentication with an authenticator app
-- (TOTP, utils/totp.js). Nothing changes for accounts that don't turn it on.
--   users.totp_secret: the app's shared key (base32) once 2FA is on.
--   users.totp_pending_secret: a key being set up, until a first code from
--     the app confirms it (then it moves to totp_secret).
--   users.totp_enabled_at: when 2FA was turned on (NULL = off).
--   users.totp_last_step: the last 30-second step a code was accepted for;
--     a code is never accepted twice.
--   users.totp_failures / totp_failures_since: wrong codes in the current
--     15-minute window (kept here, not in memory, so every server instance
--     sees the same count).
--   recovery_codes: one-time codes for when the phone is lost; only a
--     sha256 of each is kept.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret varchar(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret varchar(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_failures integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_failures_since timestamptz;
CREATE TABLE IF NOT EXISTS recovery_codes (
  id SERIAL PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
COMMIT;
