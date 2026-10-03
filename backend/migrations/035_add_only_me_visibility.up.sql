-- Migration: 035_add_only_me_visibility (UP)
-- Purpose: Day 20 -- a post's audience can be "only me" (a private note on
-- your own profile), next to 'public' and 'followers'.

BEGIN;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_posts_visibility;
ALTER TABLE posts ADD CONSTRAINT chk_posts_visibility CHECK (visibility IN ('public', 'followers', 'only_me'));
COMMIT;
