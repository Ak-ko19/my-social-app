-- Migration: 038_report_groups_pages (DOWN)
-- PostgreSQL can't drop an enum value, so the type is rebuilt. Reports about
-- groups and pages can't exist without it and are deleted.
BEGIN;
DELETE FROM reports WHERE target_type::text IN ('community', 'page');
ALTER TYPE report_target_type RENAME TO report_target_type_038;
CREATE TYPE report_target_type AS ENUM ('post', 'user', 'comment', 'message');
ALTER TABLE reports ALTER COLUMN target_type TYPE report_target_type USING target_type::text::report_target_type;
DROP TYPE report_target_type_038;
COMMIT;
