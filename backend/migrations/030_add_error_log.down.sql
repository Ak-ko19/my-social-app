-- Migration: 030_add_error_log (DOWN)
BEGIN;
DROP TABLE IF EXISTS error_groups;
COMMIT;
