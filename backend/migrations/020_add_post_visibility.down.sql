-- Migration: 020_add_post_visibility (DOWN)
-- Every post reverts to its account's audience (followers-only posts on a
-- public account become public again -- review before running on prod).
BEGIN;
ALTER TABLE posts DROP COLUMN IF EXISTS visibility;
COMMIT;
