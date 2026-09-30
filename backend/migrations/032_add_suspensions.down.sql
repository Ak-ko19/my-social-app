-- Migration: 032_add_suspensions (DOWN)
-- Current suspensions become permanent bans: the older code can't expire
-- them, and quietly unbanning people is the worse surprise. An admin can
-- unban them by hand.
BEGIN;
UPDATE reports SET resolution = 'user_banned' WHERE resolution = 'user_suspended';
ALTER TABLE reports DROP CONSTRAINT IF EXISTS chk_reports_resolution;
ALTER TABLE reports ADD CONSTRAINT chk_reports_resolution
  CHECK (resolution IN ('dismissed', 'content_removed', 'user_banned'));
DROP INDEX IF EXISTS idx_users_banned_until;
ALTER TABLE users DROP COLUMN IF EXISTS banned_until;
COMMIT;
