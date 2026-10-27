-- Migration: 083_add_post_notification_levels (DOWN)

BEGIN;
DELETE FROM notifications WHERE type IN ('group_post', 'page_post');
ALTER TABLE page_follows DROP CONSTRAINT IF EXISTS chk_page_follows_post_notifications;
ALTER TABLE page_follows DROP COLUMN IF EXISTS post_notifications;
ALTER TABLE community_members DROP CONSTRAINT IF EXISTS chk_community_members_post_notifications;
ALTER TABLE community_members DROP COLUMN IF EXISTS post_notifications;
COMMIT;
