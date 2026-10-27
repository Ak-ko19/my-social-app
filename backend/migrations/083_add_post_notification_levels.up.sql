-- Migration: 083_add_post_notification_levels (UP)
-- Purpose: Day 101 -- notifications about new posts in your groups and
-- the pages you follow, with a choice per group / page (Facebook):
--   'all': every new post;
--   'highlights' (default): a group's posts by its admins and by people you
--     follow; a page's first new post of the day;
--   'off': none.
-- The choice lives on the membership, so leaving or unfollowing drops it.

BEGIN;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS post_notifications text NOT NULL DEFAULT 'highlights';
ALTER TABLE community_members DROP CONSTRAINT IF EXISTS chk_community_members_post_notifications;
ALTER TABLE community_members ADD CONSTRAINT chk_community_members_post_notifications
  CHECK (post_notifications IN ('all', 'highlights', 'off'));
ALTER TABLE page_follows ADD COLUMN IF NOT EXISTS post_notifications text NOT NULL DEFAULT 'highlights';
ALTER TABLE page_follows DROP CONSTRAINT IF EXISTS chk_page_follows_post_notifications;
ALTER TABLE page_follows ADD CONSTRAINT chk_page_follows_post_notifications
  CHECK (post_notifications IN ('all', 'highlights', 'off'));
COMMIT;
