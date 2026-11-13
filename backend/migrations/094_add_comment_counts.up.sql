-- Migration: 094_add_comment_counts (UP)
-- Purpose: Day 113 (performance round 3) -- a comment's reaction count and
-- its number of replies are stored, not counted for every thread.
--
-- "Most relevant" ranked a post's threads by reactions and replies with two
-- counting subqueries per thread on every request (a busy post: thousands
-- of threads). The counts are now columns kept right by statement-level
-- triggers, like 092's: comment_likes in and out move like_count; a reply
-- in or out, or one approved (Day 47), moves its thread's reply_count.
-- Replies waiting for approval don't count until they are approved.

BEGIN;

ALTER TABLE comments ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION comment_like_count_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments c SET like_count = c.like_count + d.n
    FROM (SELECT comment_id, count(*)::int AS n FROM new_rows GROUP BY comment_id) d
    WHERE c.id = d.comment_id;
  ELSE
    UPDATE comments c SET like_count = c.like_count - d.n
    FROM (SELECT comment_id, count(*)::int AS n FROM old_rows GROUP BY comment_id) d
    WHERE c.id = d.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_likes_count_ins ON comment_likes;
DROP TRIGGER IF EXISTS trg_comment_likes_count_del ON comment_likes;
CREATE TRIGGER trg_comment_likes_count_ins AFTER INSERT ON comment_likes
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION comment_like_count_sync();
CREATE TRIGGER trg_comment_likes_count_del AFTER DELETE ON comment_likes
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION comment_like_count_sync();

-- A reply counts for its thread while it isn't waiting for approval.
-- This updates comments itself, and a statement-level trigger fires even
-- for an UPDATE of no rows: so an UPDATE that changed no reply's thread or
-- approval (the counters' own, the one above) stops here at once --
-- otherwise it would fire itself without end.
CREATE OR REPLACE FUNCTION comment_reply_count_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments c SET reply_count = c.reply_count + d.n
    FROM (SELECT parent_comment_id, count(*)::int AS n FROM new_rows
          WHERE parent_comment_id IS NOT NULL AND NOT awaiting_approval GROUP BY parent_comment_id) d
    WHERE c.id = d.parent_comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments c SET reply_count = c.reply_count - d.n
    FROM (SELECT parent_comment_id, count(*)::int AS n FROM old_rows
          WHERE parent_comment_id IS NOT NULL AND NOT awaiting_approval GROUP BY parent_comment_id) d
    WHERE c.id = d.parent_comment_id;
  ELSE
    -- (Inside this branch: old_rows exists only for an UPDATE.)
    IF NOT EXISTS (
      SELECT 1 FROM new_rows n JOIN old_rows o ON o.id = n.id
      WHERE n.parent_comment_id IS DISTINCT FROM o.parent_comment_id
         OR n.awaiting_approval IS DISTINCT FROM o.awaiting_approval
    ) THEN
      RETURN NULL;
    END IF;
    UPDATE comments c SET reply_count = c.reply_count + d.n
    FROM (
      SELECT parent_comment_id, sum(n)::int AS n FROM (
        SELECT parent_comment_id, 1 AS n FROM new_rows WHERE parent_comment_id IS NOT NULL AND NOT awaiting_approval
        UNION ALL
        SELECT parent_comment_id, -1 FROM old_rows WHERE parent_comment_id IS NOT NULL AND NOT awaiting_approval
      ) t GROUP BY parent_comment_id HAVING sum(n) <> 0
    ) d
    WHERE c.id = d.parent_comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_reply_count_ins ON comments;
DROP TRIGGER IF EXISTS trg_comments_reply_count_del ON comments;
DROP TRIGGER IF EXISTS trg_comments_reply_count_upd ON comments;
CREATE TRIGGER trg_comments_reply_count_ins AFTER INSERT ON comments
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION comment_reply_count_sync();
CREATE TRIGGER trg_comments_reply_count_del AFTER DELETE ON comments
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION comment_reply_count_sync();
CREATE TRIGGER trg_comments_reply_count_upd AFTER UPDATE ON comments
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION comment_reply_count_sync();

-- The counts as they are now (the triggers exist: nothing slips between).
UPDATE comments c SET like_count = d.n
FROM (SELECT comment_id, count(*)::int AS n FROM comment_likes GROUP BY comment_id) d
WHERE c.id = d.comment_id;
UPDATE comments c SET reply_count = d.n
FROM (SELECT parent_comment_id, count(*)::int AS n FROM comments
      WHERE parent_comment_id IS NOT NULL AND NOT awaiting_approval GROUP BY parent_comment_id) d
WHERE c.id = d.parent_comment_id;

COMMIT;
