-- Migration: 047_add_post_search_index (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_posts_content_fts;
COMMIT;
