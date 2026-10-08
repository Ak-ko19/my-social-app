-- Migration: 057_add_close_friends (UP)
-- Purpose: Day 47 -- a close friends list (Instagram's), and a "Close
-- friends" audience for posts and stories: seen only by their author and
-- the people on the author's list.

BEGIN;
CREATE TABLE IF NOT EXISTS close_friends (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CONSTRAINT chk_close_friends_not_self CHECK (user_id <> friend_id)
);
-- "Whose lists am I on" (and the cascade from a deleted account).
CREATE INDEX IF NOT EXISTS idx_close_friends_friend ON close_friends (friend_id);

-- 'close_friends' is 13 characters: the columns were varchar(10).
ALTER TABLE posts ALTER COLUMN visibility TYPE varchar(20);
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_posts_visibility;
ALTER TABLE posts ADD CONSTRAINT chk_posts_visibility CHECK (visibility IN ('public', 'followers', 'close_friends', 'only_me'));
ALTER TABLE post_drafts ALTER COLUMN visibility TYPE varchar(20);
ALTER TABLE post_drafts DROP CONSTRAINT IF EXISTS chk_post_drafts_visibility;
ALTER TABLE post_drafts ADD CONSTRAINT chk_post_drafts_visibility CHECK (visibility IN ('public', 'followers', 'close_friends', 'only_me'));

ALTER TABLE stories ADD COLUMN IF NOT EXISTS close_friends BOOLEAN NOT NULL DEFAULT false;
COMMIT;
