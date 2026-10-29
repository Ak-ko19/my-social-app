-- Migration: 089_add_pinned_comment (UP)
-- Purpose: Days 109-110 -- the post's author pins one comment: it comes
-- first in both orders and never again on a later page.
--   posts.pinned_comment_id: SET NULL when that comment goes.
--   idx_posts_pinned_comment: that SET NULL looks the post up by the
--     comment, on every comment deleted -- without it, a scan of posts.

BEGIN;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned_comment_id integer REFERENCES comments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_pinned_comment ON posts (pinned_comment_id) WHERE pinned_comment_id IS NOT NULL;
COMMIT;
