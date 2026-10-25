-- Migration: 079_add_post_shares (DOWN)

BEGIN;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS shares;
DROP INDEX IF EXISTS idx_posts_shared_post_id;
ALTER TABLE posts DROP COLUMN IF EXISTS is_share;
ALTER TABLE posts DROP COLUMN IF EXISTS shared_post_id;
COMMIT;
