-- Migration: 045_add_pinned_post (UP)
-- Purpose: Day 36 -- one post pinned to the top of a profile (like
-- Facebook). Deleting the post unpins it (SET NULL); the partial index
-- keeps that delete from scanning the users table.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_pinned_post ON users (pinned_post_id) WHERE pinned_post_id IS NOT NULL;
COMMIT;
