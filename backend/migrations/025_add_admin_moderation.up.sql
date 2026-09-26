-- Migration: 025_add_admin_moderation (UP)
-- Purpose: B12 admin panel -- admins, bans, and report resolution.
--
-- users.is_admin: there is deliberately NO API/UI to grant it (nobody can
-- promote themselves); an owner sets it with scripts/make-admin.js.
-- users.banned_at/ban_reason: a ban ALSO sets is_deactivated (see
-- adminController), so every existing visibility rule hides a banned
-- user's content with no query changes; banned_at is what stops login
-- from auto-reactivating them.
-- reports.resolved_*: who handled a report, when, and how.

BEGIN;

ALTER TABLE users
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN banned_at TIMESTAMPTZ,
  ADD COLUMN ban_reason TEXT;

ALTER TABLE reports
  ADD COLUMN resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN resolved_at TIMESTAMPTZ,
  ADD COLUMN resolution VARCHAR(20)
    CONSTRAINT chk_reports_resolution CHECK (resolution IN ('dismissed', 'content_removed', 'user_banned'));

COMMIT;
