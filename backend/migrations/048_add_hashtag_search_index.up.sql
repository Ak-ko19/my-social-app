-- Migration: 048_add_hashtag_search_index (UP)
-- Purpose: Day 42 -- hashtag search (GET /search/hashtags) matches any
-- part of a tag, case-insensitively: LOWER(tag) LIKE '%...%'. A trigram
-- index on LOWER(tag) serves that without reading every tag.

BEGIN;
CREATE INDEX IF NOT EXISTS idx_hashtags_tag_trgm ON hashtags USING GIN (LOWER(tag) gin_trgm_ops);
COMMIT;
