-- Migration: 002_add_trigram_search_indexes
-- Purpose: ILIKE '%term%' (leading wildcard) can never use a plain B-tree
-- index -- it forces a sequential scan on users/posts regardless of table
-- size. pg_trgm's GIN trigram indexes are the standard Postgres answer for
-- substring/ILIKE search at scale, and searchUsers/searchPosts already use
-- exactly this ILIKE '%q%' pattern.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_trgm ON users USING GIN (username gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_content_trgm ON posts USING GIN (content gin_trgm_ops);
