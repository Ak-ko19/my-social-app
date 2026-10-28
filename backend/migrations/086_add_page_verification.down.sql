-- Migration: 086_add_page_verification (DOWN)

BEGIN;
DELETE FROM admin_actions WHERE action IN ('page_verified', 'page_declined', 'page_unverified');
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS chk_admin_actions_action;
ALTER TABLE admin_actions ADD CONSTRAINT chk_admin_actions_action CHECK (action IN (
  'report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved', 'admin_search'
));
DELETE FROM notifications WHERE type IN ('page_verified', 'page_not_verified', 'page_unverified');
DROP TABLE IF EXISTS page_verification_requests;
ALTER TABLE pages DROP COLUMN IF EXISTS verification_removed_at;
ALTER TABLE pages DROP COLUMN IF EXISTS verified_at;
COMMIT;
