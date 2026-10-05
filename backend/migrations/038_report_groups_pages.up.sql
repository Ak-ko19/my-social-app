-- Migration: 038_report_groups_pages (UP)
-- Purpose: Day 24 -- groups (communities) and pages can be reported too.
-- Same columns as comment/message reports (031): target_owner_id is who
-- made the group/page, target_snapshot its name and description as they
-- were when reported.

BEGIN;
ALTER TYPE report_target_type ADD VALUE IF NOT EXISTS 'community';
ALTER TYPE report_target_type ADD VALUE IF NOT EXISTS 'page';
COMMIT;
