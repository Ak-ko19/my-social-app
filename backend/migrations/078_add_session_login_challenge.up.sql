-- Migration: 078_add_session_login_challenge (UP)
-- Purpose: Day 92 (AUDIT_REPORT_4 B3) -- a two-factor login challenge
-- (the 5-minute token POST /login hands out) works for ONE login only.
--   sessions.login_challenge: the challenge's id (its jti), for sessions
--     made by the two-factor step; NULL for every other session.
--   idx_sessions_login_challenge: unique, so a second login with the same
--     challenge fails even when two requests race on two instances.

BEGIN;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS login_challenge uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_login_challenge ON sessions (login_challenge)
  WHERE login_challenge IS NOT NULL;
COMMIT;
