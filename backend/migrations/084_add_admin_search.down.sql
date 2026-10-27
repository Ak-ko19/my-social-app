-- Migration: 084_add_admin_search (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_users_email_lower;
DROP INDEX IF EXISTS idx_comments_content_trgm;
DELETE FROM admin_actions WHERE action = 'admin_search';
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS chk_admin_actions_target;
ALTER TABLE admin_actions ADD CONSTRAINT chk_admin_actions_target CHECK (target_type IN (
  'post', 'comment', 'message', 'community', 'page', 'user', 'error'
));
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS chk_admin_actions_action;
ALTER TABLE admin_actions ADD CONSTRAINT chk_admin_actions_action CHECK (action IN (
  'report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved'
));
COMMIT;
