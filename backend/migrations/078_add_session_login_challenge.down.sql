-- Migration: 078_add_session_login_challenge (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_sessions_login_challenge;
ALTER TABLE sessions DROP COLUMN IF EXISTS login_challenge;
COMMIT;
