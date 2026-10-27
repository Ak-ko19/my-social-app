-- Migration: 085_add_profile_card_dismissed (UP)
-- Purpose: Day 105 -- the "Finish your profile" card on Home (photo, cover,
-- bio, a link). Hiding it ("Don't show again") is kept here, so it stays
-- hidden on every device; NULL = still shown while something is left.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_card_dismissed_at timestamptz;
COMMIT;
