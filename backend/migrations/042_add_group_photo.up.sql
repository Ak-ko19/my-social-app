-- Migration: 042_add_group_photo (UP)
-- Purpose: Day 34 -- a group chat's photo (a Cloudinary URL; NULL = the
-- group glyph). Admins set or remove it; the old file is deleted then, and
-- with the group (controllers/groupController.js).

BEGIN;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT;
COMMIT;
