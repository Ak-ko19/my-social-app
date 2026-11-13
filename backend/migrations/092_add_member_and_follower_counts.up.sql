-- Migration: 092_add_member_and_follower_counts (UP)
-- Purpose: Day 113 (performance round 3) -- a group's member count, a
-- page's follower count and a person's follower count are stored, not
-- counted on every request.
--
-- Discover listed groups "most members first" and pages "most followers
-- first" by counting every membership of every group (every follow of every
-- page) per request, opening a busy group counted all its members, and a
-- new account's "People you may know" counted everyone's followers. The
-- counts are now columns, kept right by triggers on the membership tables,
-- so every way in or out -- join, leave, approve, remove, ban, a deleted
-- account (cascade) -- updates them in the same transaction, with no code
-- path to forget. Statement-level triggers with transition tables: one
-- UPDATE per statement, not per row, so a cascade (an account in 50 groups,
-- a deleted group of 20k members) stays cheap.

BEGIN;

ALTER TABLE communities ADD COLUMN IF NOT EXISTS member_count integer NOT NULL DEFAULT 0;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS follower_count integer NOT NULL DEFAULT 0;

-- Group members: only status = 'member' counts (not pending requests).
CREATE OR REPLACE FUNCTION community_member_count_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities c SET member_count = c.member_count + d.n
    FROM (SELECT community_id, count(*)::int AS n FROM new_rows WHERE status = 'member' GROUP BY community_id) d
    WHERE c.id = d.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities c SET member_count = c.member_count - d.n
    FROM (SELECT community_id, count(*)::int AS n FROM old_rows WHERE status = 'member' GROUP BY community_id) d
    WHERE c.id = d.community_id;
  ELSE
    UPDATE communities c SET member_count = c.member_count + d.n
    FROM (
      SELECT community_id, sum(n)::int AS n FROM (
        SELECT community_id, 1 AS n FROM new_rows WHERE status = 'member'
        UNION ALL
        SELECT community_id, -1 FROM old_rows WHERE status = 'member'
      ) t GROUP BY community_id HAVING sum(n) <> 0
    ) d
    WHERE c.id = d.community_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_members_count_ins ON community_members;
DROP TRIGGER IF EXISTS trg_community_members_count_del ON community_members;
DROP TRIGGER IF EXISTS trg_community_members_count_upd ON community_members;
CREATE TRIGGER trg_community_members_count_ins AFTER INSERT ON community_members
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION community_member_count_sync();
CREATE TRIGGER trg_community_members_count_del AFTER DELETE ON community_members
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION community_member_count_sync();
CREATE TRIGGER trg_community_members_count_upd AFTER UPDATE ON community_members
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION community_member_count_sync();

-- Page followers: every row counts.
CREATE OR REPLACE FUNCTION page_follower_count_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE pages p SET follower_count = p.follower_count + d.n
    FROM (SELECT page_id, count(*)::int AS n FROM new_rows GROUP BY page_id) d
    WHERE p.id = d.page_id;
  ELSE
    UPDATE pages p SET follower_count = p.follower_count - d.n
    FROM (SELECT page_id, count(*)::int AS n FROM old_rows GROUP BY page_id) d
    WHERE p.id = d.page_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_page_follows_count_ins ON page_follows;
DROP TRIGGER IF EXISTS trg_page_follows_count_del ON page_follows;
CREATE TRIGGER trg_page_follows_count_ins AFTER INSERT ON page_follows
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION page_follower_count_sync();
CREATE TRIGGER trg_page_follows_count_del AFTER DELETE ON page_follows
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION page_follower_count_sync();

-- A person's followers: accepted follows only (not pending requests).
-- "People you may know" falls back to the most-followed public accounts,
-- which counted every account's followers per request.
ALTER TABLE users ADD COLUMN IF NOT EXISTS follower_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION user_follower_count_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users u SET follower_count = u.follower_count + d.n
    FROM (SELECT following_id, count(*)::int AS n FROM new_rows WHERE status = 'accepted' GROUP BY following_id) d
    WHERE u.id = d.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users u SET follower_count = u.follower_count - d.n
    FROM (SELECT following_id, count(*)::int AS n FROM old_rows WHERE status = 'accepted' GROUP BY following_id) d
    WHERE u.id = d.following_id;
  ELSE
    UPDATE users u SET follower_count = u.follower_count + d.n
    FROM (
      SELECT following_id, sum(n)::int AS n FROM (
        SELECT following_id, 1 AS n FROM new_rows WHERE status = 'accepted'
        UNION ALL
        SELECT following_id, -1 FROM old_rows WHERE status = 'accepted'
      ) t GROUP BY following_id HAVING sum(n) <> 0
    ) d
    WHERE u.id = d.following_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follows_count_ins ON follows;
DROP TRIGGER IF EXISTS trg_follows_count_del ON follows;
DROP TRIGGER IF EXISTS trg_follows_count_upd ON follows;
CREATE TRIGGER trg_follows_count_ins AFTER INSERT ON follows
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION user_follower_count_sync();
CREATE TRIGGER trg_follows_count_del AFTER DELETE ON follows
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION user_follower_count_sync();
CREATE TRIGGER trg_follows_count_upd AFTER UPDATE ON follows
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION user_follower_count_sync();

-- The counts as they are now (after the triggers exist, inside this
-- transaction: no change can slip between the two).
UPDATE communities c SET member_count = COALESCE(
  (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'member'), 0);
UPDATE pages p SET follower_count = COALESCE((SELECT count(*) FROM page_follows f WHERE f.page_id = p.id), 0);
UPDATE users u SET follower_count = d.n
FROM (SELECT following_id, count(*)::int AS n FROM follows WHERE status = 'accepted' GROUP BY following_id) d
WHERE u.id = d.following_id;

-- Discover: most members / followers first.
CREATE INDEX IF NOT EXISTS idx_communities_member_count ON communities (member_count DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pages_follower_count ON pages (follower_count DESC, id DESC);
-- "Popular" suggestions: public, active accounts, most followed first.
CREATE INDEX IF NOT EXISTS idx_users_popular ON users (follower_count DESC, id DESC) WHERE NOT is_private AND NOT is_deactivated;
-- A group's member list, in its own order (admins first, then by joining),
-- so a page of it reads that page and not every member.
CREATE INDEX IF NOT EXISTS idx_community_members_list
  ON community_members (community_id, (role = 'admin') DESC, joined_at, user_id) WHERE status = 'member';

COMMIT;
