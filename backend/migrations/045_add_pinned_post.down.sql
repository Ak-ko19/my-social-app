-- Migration: 045_add_pinned_post (DOWN)
-- Profiles lose their pinned post (the post itself stays).
BEGIN;
DROP INDEX IF EXISTS idx_users_pinned_post;
ALTER TABLE users DROP COLUMN IF EXISTS pinned_post_id;
COMMIT;
