-- Migration: 043_add_profile_links (UP)
-- Purpose: Day 36 -- links on a profile (up to 3 web addresses; validated
-- and normalized in utils/profileLinks.js). Public, like the bio.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS links TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_links_count;
ALTER TABLE users ADD CONSTRAINT chk_users_links_count CHECK (cardinality(links) <= 3);
COMMIT;
