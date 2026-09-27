-- Migration: 027_add_pages (DOWN)
-- Page posts are deleted with their pages (they'd otherwise silently turn
-- into the owner's personal posts).
BEGIN;
DELETE FROM posts WHERE page_id IS NOT NULL;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_group_or_page;
DROP INDEX IF EXISTS idx_posts_page_created;
ALTER TABLE posts DROP COLUMN IF EXISTS page_id;
DROP TABLE IF EXISTS page_follows;
DROP TABLE IF EXISTS pages;
COMMIT;
