-- Migration: 044_add_cover_photo (DOWN)
-- Profiles lose their covers (the files are left for the orphan scan,
-- scripts/cloudinary-orphans.js).
BEGIN;
ALTER TABLE users DROP COLUMN IF EXISTS cover_url;
COMMIT;
