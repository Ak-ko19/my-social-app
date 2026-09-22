-- Migration: 010_add_hashtags (DOWN)
BEGIN;
DROP TABLE IF EXISTS post_hashtags;
DROP TABLE IF EXISTS hashtags;
COMMIT;
