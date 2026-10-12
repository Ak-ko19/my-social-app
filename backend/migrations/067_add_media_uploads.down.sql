-- Migration: 067_add_media_uploads (DOWN)

BEGIN;
DROP TABLE IF EXISTS media_uploads;
COMMIT;
