-- Migration: 084_add_admin_search (UP)
-- Purpose: Days 103-104 -- a content search for admins (posts, comments,
-- accounts). Admins can read private content there, so each search is
-- written to the admin log ('admin_search', target 'search', the query as
-- its label).
--   idx_comments_content_trgm: comments by their text (posts and
--     usernames already have trigram indexes, migration 002).
--   idx_users_email_lower: an account by its email in any letter case
--     (emails are kept as typed).

BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS chk_admin_actions_action;
ALTER TABLE admin_actions ADD CONSTRAINT chk_admin_actions_action CHECK (action IN (
  'report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved', 'admin_search'
));
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS chk_admin_actions_target;
ALTER TABLE admin_actions ADD CONSTRAINT chk_admin_actions_target CHECK (target_type IN (
  'post', 'comment', 'message', 'community', 'page', 'user', 'error', 'search'
));
CREATE INDEX IF NOT EXISTS idx_comments_content_trgm ON comments USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
COMMIT;
