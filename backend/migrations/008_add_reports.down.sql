-- Migration: 008_add_reports (DOWN)
BEGIN;
DROP TABLE IF EXISTS reports;
DROP TYPE IF EXISTS report_status;
DROP TYPE IF EXISTS report_target_type;
COMMIT;
