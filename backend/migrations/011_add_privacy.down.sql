-- Migration: 011_add_privacy (DOWN)
BEGIN;
ALTER TABLE follows DROP COLUMN status;
DROP TYPE IF EXISTS follow_status;
ALTER TABLE users DROP COLUMN is_private;
COMMIT;
