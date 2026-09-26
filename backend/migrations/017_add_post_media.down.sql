-- Migration: 017_add_post_media (DOWN)
-- posts.image_url still holds each post's first image, so dropping
-- post_media loses only the 2nd..Nth images of multi-image posts.
BEGIN;
DROP TABLE IF EXISTS post_media;
COMMIT;
