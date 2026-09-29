-- Migration: 028_add_sessions (DOWN)
-- Tokens that carry a session id keep verifying as plain JWTs afterwards
-- (older code ignores the "sid" claim); only revocation is lost.
BEGIN;
ALTER TABLE users DROP COLUMN IF EXISTS tokens_valid_after;
DROP TABLE IF EXISTS sessions;
COMMIT;
