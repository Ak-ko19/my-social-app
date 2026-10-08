-- Migration: 054_add_bookmark_collections (DOWN)
-- The saved posts themselves (bookmarks) are untouched.

BEGIN;
DROP TABLE IF EXISTS bookmark_collection_items;
DROP TABLE IF EXISTS bookmark_collections;
COMMIT;
