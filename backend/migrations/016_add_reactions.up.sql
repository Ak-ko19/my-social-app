-- Migration: 016_add_reactions (UP)
-- Purpose: B1 reactions (like/love/haha/wow/sad/angry). Extends the
-- existing likes table instead of adding a new one: a reaction IS a like
-- with a type, UNIQUE(post_id, user_id) already enforces "one reaction per
-- user per post", and every existing row becomes a plain 'like' via the
-- default -- so all current like data, counts and the POST/DELETE
-- /posts/:id/like API keep working unchanged.

BEGIN;

ALTER TABLE likes
  ADD COLUMN reaction VARCHAR(10) NOT NULL DEFAULT 'like'
  CONSTRAINT chk_likes_reaction CHECK (reaction IN ('like', 'love', 'haha', 'wow', 'sad', 'angry'));

COMMIT;
