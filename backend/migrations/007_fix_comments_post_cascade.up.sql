-- Migration: 007_fix_comments_post_cascade (UP)
-- Purpose: comments.post_id was left NO ACTION when comments/likes/
-- notifications were originally created -- likes.post_id and
-- notifications.post_id already cascade, but comments.post_id does not.
-- In practice this means DELETE /posts/:id (postController.deletePost)
-- currently fails with a foreign-key violation for any post that has at
-- least one comment, since Postgres blocks the delete rather than orphaning
-- the comment rows. Found while building the post edit/delete UI (Feature
-- 4 of the 2026-09-22 batch), which is the first place this endpoint gets
-- exercised against posts that actually have comments.
--
-- Metadata-only change (drop + add constraint), instant on any table size --
-- no CONCURRENTLY/NOT VALID dance needed like 001/005's index/CHECK
-- additions.

BEGIN;

ALTER TABLE comments DROP CONSTRAINT comments_post_id_fkey;
ALTER TABLE comments ADD CONSTRAINT comments_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

COMMIT;
