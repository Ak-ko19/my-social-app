-- Migration: 028_add_sessions (UP)
-- Purpose: Day 8 session revocation. Every login creates a session row;
-- its id travels inside the JWT (claim "sid"), and every authenticated
-- request checks the row is still valid. That makes it possible to sign
-- other devices out (password change), to "log out of all devices", and
-- to list active sessions -- none of which a bare 7-day JWT allows.
--
-- users.tokens_valid_after: tokens issued before this migration carry no
-- session id. They keep working until they expire (nobody is logged out
-- by the deploy) unless revoked: a token WITHOUT a sid issued at or before
-- this time is rejected. A password change or "log out everywhere" sets it
-- to now().
--
-- gen_random_uuid() is built into PostgreSQL 13+ (Neon runs 15+): session
-- ids are unguessable, so the sessions API can use them directly.

BEGIN;

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);
-- "This user's live sessions": revocation and the sessions list.
CREATE INDEX idx_sessions_user_active ON sessions (user_id) WHERE revoked_at IS NULL;

ALTER TABLE users ADD COLUMN tokens_valid_after TIMESTAMPTZ;

COMMIT;
