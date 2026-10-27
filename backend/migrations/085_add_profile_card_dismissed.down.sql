-- Migration: 085_add_profile_card_dismissed (DOWN)

BEGIN;
ALTER TABLE users DROP COLUMN IF EXISTS profile_card_dismissed_at;
COMMIT;
