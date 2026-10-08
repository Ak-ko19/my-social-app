-- Migration: 057_add_close_friends (DOWN)
-- Close-friends posts and drafts become "only me" (never MORE visible than
-- they were); close-friends stories are deleted rather than shown to all
-- followers.

BEGIN;
UPDATE posts SET visibility = 'only_me' WHERE visibility = 'close_friends';
UPDATE post_drafts SET visibility = 'only_me' WHERE visibility = 'close_friends';
DELETE FROM stories WHERE close_friends;
ALTER TABLE stories DROP COLUMN IF EXISTS close_friends;
ALTER TABLE post_drafts DROP CONSTRAINT IF EXISTS chk_post_drafts_visibility;
ALTER TABLE post_drafts ALTER COLUMN visibility TYPE varchar(10);
ALTER TABLE post_drafts ADD CONSTRAINT chk_post_drafts_visibility CHECK (visibility IN ('public', 'followers', 'only_me'));
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_posts_visibility;
ALTER TABLE posts ALTER COLUMN visibility TYPE varchar(10);
ALTER TABLE posts ADD CONSTRAINT chk_posts_visibility CHECK (visibility IN ('public', 'followers', 'only_me'));
DROP TABLE IF EXISTS close_friends;
COMMIT;
