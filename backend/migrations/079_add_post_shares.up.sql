-- Migration: 079_add_post_shares (UP)
-- Purpose: Days 93-94 -- share someone's post to your own feed (Facebook's
-- "Share"), with your own words.
--   posts.shared_post_id: the post this one shares; NULL once that post is
--     deleted (the share stays, saying the content isn't available).
--   posts.is_share: true for a share, so it still knows it was one after
--     the original is gone.
--   idx_posts_shared_post_id: share counts, and the SET NULL on delete.
--   notification_preferences.shares: "shared your post" on/off.

BEGIN;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_post_id integer REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_share boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_shared_post_id ON posts (shared_post_id) WHERE shared_post_id IS NOT NULL;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS shares boolean NOT NULL DEFAULT true;
COMMIT;
