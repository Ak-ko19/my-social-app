-- Migration: 025_add_admin_moderation (DOWN)
-- Banned users become ordinary deactivated accounts (they can reactivate
-- by logging in) -- review before running on production.
BEGIN;
ALTER TABLE reports DROP COLUMN IF EXISTS resolution;
ALTER TABLE reports DROP COLUMN IF EXISTS resolved_at;
ALTER TABLE reports DROP COLUMN IF EXISTS resolved_by;
ALTER TABLE users DROP COLUMN IF EXISTS ban_reason;
ALTER TABLE users DROP COLUMN IF EXISTS banned_at;
ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
COMMIT;
