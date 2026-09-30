-- Migration: 031_report_comments_messages (DOWN)
-- PostgreSQL can't drop an enum value, so the type is rebuilt. Reports about
-- comments and messages can't exist without it and are deleted.
BEGIN;
DELETE FROM reports WHERE target_type::text IN ('comment', 'message');
DROP INDEX IF EXISTS idx_reports_target_owner;
ALTER TABLE reports DROP COLUMN IF EXISTS target_owner_id, DROP COLUMN IF EXISTS target_snapshot;
ALTER TYPE report_target_type RENAME TO report_target_type_031;
CREATE TYPE report_target_type AS ENUM ('post', 'user');
ALTER TABLE reports ALTER COLUMN target_type TYPE report_target_type USING target_type::text::report_target_type;
DROP TYPE report_target_type_031;
COMMIT;
