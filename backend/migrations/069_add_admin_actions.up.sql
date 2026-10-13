-- Migration: 069_add_admin_actions (UP)
-- Purpose: Day 63 -- the admin audit log. One row per moderation decision:
-- who made it, what, about which account / group / page / error, when.
-- Rows are only ever added (and removed by the cleanup after 2 years).
-- The removed content itself is never copied here.

BEGIN;
CREATE TABLE IF NOT EXISTS admin_actions (
  id BIGSERIAL PRIMARY KEY,
  -- The admin, and their name at the time (the row outlives the account).
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admin_username varchar(50) NOT NULL,
  action varchar(20) NOT NULL CONSTRAINT chk_admin_actions_action CHECK (action IN (
    'report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved'
  )),
  target_type varchar(10) NOT NULL CONSTRAINT chk_admin_actions_target CHECK (target_type IN (
    'post', 'comment', 'message', 'community', 'page', 'user', 'error'
  )),
  -- A row id, or an error's fingerprint.
  target_id varchar(40) NOT NULL,
  -- Whose content / which account, group or page, or the error's message.
  target_label varchar(120),
  -- { reportId, reportsResolved, days, reason }
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- The log, newest first (and the cleanup).
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions (created_at DESC, id DESC);
COMMIT;
