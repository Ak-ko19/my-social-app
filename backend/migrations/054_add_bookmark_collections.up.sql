-- Migration: 054_add_bookmark_collections (UP)
-- Purpose: Day 46 -- saved posts organised into named collections, like
-- Instagram's. A collection holds bookmarks (not posts), so unsaving a post
-- takes it out of every collection; deleting a collection keeps the posts
-- saved. A post can be in several collections.

BEGIN;
CREATE TABLE IF NOT EXISTS bookmark_collections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL CONSTRAINT chk_bookmark_collections_name CHECK (btrim(name) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One "Recipes" per person, whatever the capitalisation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmark_collections_user_name ON bookmark_collections (user_id, lower(name));

CREATE TABLE IF NOT EXISTS bookmark_collection_items (
  collection_id INTEGER NOT NULL REFERENCES bookmark_collections(id) ON DELETE CASCADE,
  bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, bookmark_id)
);
-- Unsaving a post (the cascade) and "which collections is it in".
CREATE INDEX IF NOT EXISTS idx_bookmark_collection_items_bookmark ON bookmark_collection_items (bookmark_id);
COMMIT;
