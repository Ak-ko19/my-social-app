-- Migration: 047_add_post_search_index (UP)
-- Purpose: Day 42 -- ranked post search. A GIN index on the posts' text
-- as English words (stemmed: "running" finds "run"), used by
-- websearch_to_tsquery matches and ts_rank_cd. Other scripts pass
-- through as plain words; Burmese (no spaces between words) keeps using
-- the substring match on idx_posts_content_trgm. The query must use the
-- same expression, to_tsvector('english', content), to use the index.
-- (Built inside the transaction: posts is small at launch. On a big table
-- use CREATE INDEX CONCURRENTLY outside a transaction instead.)

BEGIN;
CREATE INDEX IF NOT EXISTS idx_posts_content_fts ON posts USING GIN (to_tsvector('english', content));
COMMIT;
