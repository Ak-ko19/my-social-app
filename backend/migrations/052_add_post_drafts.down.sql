-- Migration: 052_add_post_drafts (DOWN)

BEGIN;
DROP TABLE IF EXISTS post_drafts;
COMMIT;
