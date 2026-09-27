-- Migration: 027_add_pages (UP)
-- Purpose: B14 Pages -- business/creator pages that are distinct from user
-- accounts. A page has one owner (a user) who posts AS the page; other
-- users follow the page (no approval -- pages are always public).
--
-- posts.page_id: NULL for normal posts; set for posts authored as a page.
-- posts.user_id stays the real person who wrote it (the owner), so
-- ownership checks, blocks and account deletion keep working unchanged.
-- Page posts are always visibility 'public', even if the owner's personal
-- account is private.

BEGIN;

CREATE TABLE pages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
  category VARCHAR(20) NOT NULL DEFAULT 'business'
    CHECK (category IN ('business', 'creator', 'brand', 'organization', 'community', 'other')),
  description TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pages_owner ON pages (owner_id);

CREATE TABLE page_follows (
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, user_id)
);
-- "Which pages do I follow" (home feed) + account-deletion cascade.
CREATE INDEX idx_page_follows_user ON page_follows (user_id);

ALTER TABLE posts ADD COLUMN page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE;
CREATE INDEX idx_posts_page_created ON posts (page_id, created_at DESC) WHERE page_id IS NOT NULL;
-- A post lives in a group OR on a page, never both.
ALTER TABLE posts ADD CONSTRAINT posts_group_or_page CHECK (community_id IS NULL OR page_id IS NULL);

COMMIT;
