-- Migration: 019_add_comment_replies_likes (UP)
-- Purpose: B4 nested comment replies + comment likes.
--
-- Replies are ONE level deep (Facebook-style): parent_comment_id always
-- points at a top-level comment; replying to a reply attaches to that
-- reply's parent (the API flattens it). Deleting a comment deletes its
-- replies (CASCADE), same as deleting a post deletes its comments.

BEGIN;

ALTER TABLE comments
  ADD COLUMN parent_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE;

-- "Replies of these comments" lookups + the cascade above.
CREATE INDEX idx_comments_parent_comment_id ON comments (parent_comment_id);

CREATE TABLE comment_likes (
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- Cascade on account deletion.
CREATE INDEX idx_comment_likes_user_id ON comment_likes (user_id);

COMMIT;
