-- Migration: 026_add_communities (DOWN)
-- Posts made inside communities are deleted with them (they have no
-- meaning outside their community).
BEGIN;
DELETE FROM posts WHERE community_id IS NOT NULL;
DROP INDEX IF EXISTS idx_posts_community_created;
ALTER TABLE posts DROP COLUMN IF EXISTS community_id;
DROP TABLE IF EXISTS community_members;
DROP TABLE IF EXISTS communities;
COMMIT;
