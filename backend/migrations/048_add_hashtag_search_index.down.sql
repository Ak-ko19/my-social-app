-- Migration: 048_add_hashtag_search_index (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_hashtags_tag_trgm;
COMMIT;
