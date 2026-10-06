-- Migration: 044_add_cover_photo (UP)
-- Purpose: Day 36 -- a profile's cover photo (a Cloudinary URL; NULL = no
-- cover). The old file is deleted when it is replaced or removed, and with
-- the account (services/mediaCleanupService.js mediaOfUser).

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url TEXT;
COMMIT;
