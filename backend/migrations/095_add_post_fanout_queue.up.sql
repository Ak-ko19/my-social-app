-- Migration: 095_add_post_fanout_queue (UP)
-- Purpose: Day 113 (performance round 3) -- "X posted in GROUP" / "PAGE
-- posted" to a big audience is sent after the post request, not in it.
--
-- Day 101 told every member / follower inside POST /posts: one notification
-- each, then a push and a badge update each. For a group or page with many
-- thousands, the person posting waited for all of it. A post whose audience
-- is bigger than a small limit now waits here; postFanoutService sends it
-- in chunks in member order, moving after_user_id in the same transaction
-- as each chunk's notifications, so nobody is told twice or skipped, even
-- with several server instances. A deleted post takes its job with it.

BEGIN;

CREATE TABLE IF NOT EXISTS post_fanout_queue (
  post_id integer PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  -- Everyone up to this user id has been handled.
  after_user_id integer NOT NULL DEFAULT 0,
  queued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_post_fanout_queue_queued ON post_fanout_queue (queued_at);

COMMIT;
