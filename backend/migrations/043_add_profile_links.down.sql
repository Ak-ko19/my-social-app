-- Migration: 043_add_profile_links (DOWN)
-- Profiles lose their links.
BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_links_count;
ALTER TABLE users DROP COLUMN IF EXISTS links;
COMMIT;
