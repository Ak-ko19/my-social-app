-- Migration: 032_add_suspensions (UP)
-- Purpose: Day 12 -- temporary suspensions next to permanent bans.
--   users.banned_until: NULL = a permanent ban (as before); a time = the
--     account is suspended until then. It is lifted by itself afterwards
--     (services/moderationService.js: on the user's next request or login,
--     and by the daily cleanup job).
--   reports.resolution: + 'user_suspended'.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS chk_reports_resolution;
ALTER TABLE reports ADD CONSTRAINT chk_reports_resolution
  CHECK (resolution IN ('dismissed', 'content_removed', 'user_banned', 'user_suspended'));
CREATE INDEX IF NOT EXISTS idx_users_banned_until ON users (banned_until) WHERE banned_until IS NOT NULL;
COMMIT;
