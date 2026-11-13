-- Migration: 092_add_member_and_follower_counts (DOWN)
-- Back to counting members and followers per request.

BEGIN;

DROP INDEX IF EXISTS idx_users_popular;
DROP INDEX IF EXISTS idx_community_members_list;
DROP INDEX IF EXISTS idx_pages_follower_count;
DROP INDEX IF EXISTS idx_communities_member_count;

DROP TRIGGER IF EXISTS trg_page_follows_count_ins ON page_follows;
DROP TRIGGER IF EXISTS trg_page_follows_count_del ON page_follows;
DROP FUNCTION IF EXISTS page_follower_count_sync();

DROP TRIGGER IF EXISTS trg_community_members_count_ins ON community_members;
DROP TRIGGER IF EXISTS trg_community_members_count_del ON community_members;
DROP TRIGGER IF EXISTS trg_community_members_count_upd ON community_members;
DROP FUNCTION IF EXISTS community_member_count_sync();

DROP TRIGGER IF EXISTS trg_follows_count_ins ON follows;
DROP TRIGGER IF EXISTS trg_follows_count_del ON follows;
DROP TRIGGER IF EXISTS trg_follows_count_upd ON follows;
DROP FUNCTION IF EXISTS user_follower_count_sync();

ALTER TABLE users DROP COLUMN IF EXISTS follower_count;
ALTER TABLE pages DROP COLUMN IF EXISTS follower_count;
ALTER TABLE communities DROP COLUMN IF EXISTS member_count;

COMMIT;
