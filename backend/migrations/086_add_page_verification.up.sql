-- Migration: 086_add_page_verification (UP)
-- Purpose: Day 106 -- page verification requests. A page's owner or admins
-- ask; an admin approves or declines (with a reason); an approved page
-- shows the blue tick (pages.verified_at). Each decision goes in the admin
-- log.
--   page_verification_requests: one row per request. At most one pending
--     per page (uq_page_verification_pending); the decided ones are kept,
--     so a page asking again can be held back after a decline and the
--     admins see what was decided before.
--   decline_reason: a fixed list, so the page's managers read it in their
--     own language (incomplete / not_notable / impersonation / other).

BEGIN;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS verified_at timestamptz;
-- When an admin last took the tick away (the same wait as a decline).
ALTER TABLE pages ADD COLUMN IF NOT EXISTS verification_removed_at timestamptz;

CREATE TABLE IF NOT EXISTS page_verification_requests (
  id serial PRIMARY KEY,
  page_id integer NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  requested_by integer REFERENCES users(id) ON DELETE SET NULL,
  note varchar(500) NOT NULL CHECK (length(btrim(note)) > 0),
  link varchar(300),
  status varchar(10) NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_page_verification_status CHECK (status IN ('pending', 'approved', 'declined')),
  decided_by integer REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decline_reason varchar(20)
    CONSTRAINT chk_page_verification_reason CHECK (decline_reason IN ('incomplete', 'not_notable', 'impersonation', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_page_verification_decided CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT chk_page_verification_declined CHECK ((status = 'declined') = (decline_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_verification_pending ON page_verification_requests (page_id) WHERE status = 'pending';
-- A page's latest request (its managers' screen, the 30-day wait).
CREATE INDEX IF NOT EXISTS idx_page_verification_page ON page_verification_requests (page_id, created_at DESC, id DESC);
-- Admin > Verification: the oldest pending first; the decided ones newest first.
CREATE INDEX IF NOT EXISTS idx_page_verification_queue ON page_verification_requests (created_at, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_page_verification_decided ON page_verification_requests (decided_at DESC, id DESC) WHERE status <> 'pending';

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS chk_admin_actions_action;
ALTER TABLE admin_actions ADD CONSTRAINT chk_admin_actions_action CHECK (action IN (
  'report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved', 'admin_search',
  'page_verified', 'page_declined', 'page_unverified'
));
COMMIT;
