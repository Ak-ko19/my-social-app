-- Migration: 056_add_user_restrictions (DOWN)
-- Comments that were waiting for approval become ordinary (visible)
-- comments again: the column that hid them goes.

BEGIN;
ALTER TABLE comments DROP COLUMN IF EXISTS awaiting_approval;
DROP TABLE IF EXISTS user_restrictions;
COMMIT;
