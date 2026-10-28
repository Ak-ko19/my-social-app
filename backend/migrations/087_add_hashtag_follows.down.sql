-- Migration: 087_add_hashtag_follows (DOWN)

BEGIN;
DROP TABLE IF EXISTS hashtag_follows;
COMMIT;
