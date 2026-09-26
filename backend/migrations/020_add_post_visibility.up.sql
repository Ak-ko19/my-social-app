-- Migration: 020_add_post_visibility (UP)
-- Purpose: B5 per-post audience. 'public' (default -- every existing post
-- keeps its current audience) or 'followers' (only the author and
-- accepted followers). This is IN ADDITION to account-level privacy: a
-- private account's posts are already followers-only whatever this says.

BEGIN;

ALTER TABLE posts
  ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'public'
  CONSTRAINT chk_posts_visibility CHECK (visibility IN ('public', 'followers'));

COMMIT;
