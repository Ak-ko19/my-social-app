-- Migration: 007_fix_comments_post_cascade (DOWN)
BEGIN;

ALTER TABLE comments DROP CONSTRAINT comments_post_id_fkey;
ALTER TABLE comments ADD CONSTRAINT comments_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES posts(id);

COMMIT;
