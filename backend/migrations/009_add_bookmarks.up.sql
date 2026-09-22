-- Migration: 009_add_bookmarks (UP)
-- Purpose: Save/bookmark a post for later. Same shape as `likes`
-- (user_id, post_id, cascade both ways) since the access pattern is
-- identical: toggle by (user, post), list a user's saved posts newest-first.

BEGIN;

CREATE TABLE bookmarks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevents double-bookmarking and serves the "is this post bookmarked by
-- me" existence check (postController's bookmarked_by_me subquery).
CREATE UNIQUE INDEX idx_bookmarks_user_post ON bookmarks (user_id, post_id);

-- Saved-posts page: newest-first list for one user.
CREATE INDEX idx_bookmarks_user_created_at ON bookmarks (user_id, created_at DESC);

COMMIT;
