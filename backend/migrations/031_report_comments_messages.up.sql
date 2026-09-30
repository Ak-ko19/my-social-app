-- Migration: 031_report_comments_messages (UP)
-- Purpose: Day 12 -- comments and messages can be reported, not only posts
-- and users.
--   target_owner_id: who wrote the reported post/comment/message, so banning
--     them resolves those reports too, and the admin still sees whose it
--     was after the content is gone.
--   target_snapshot: the reported text as it was when reported (up to 1000
--     characters), so editing or unsending it doesn't erase the evidence.
-- ALTER TYPE ... ADD VALUE is allowed inside a transaction (PostgreSQL 12+)
-- as long as the new values aren't used in that same transaction.

BEGIN;
ALTER TYPE report_target_type ADD VALUE IF NOT EXISTS 'comment';
ALTER TYPE report_target_type ADD VALUE IF NOT EXISTS 'message';
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS target_owner_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_snapshot text;
CREATE INDEX IF NOT EXISTS idx_reports_target_owner ON reports (target_owner_id) WHERE target_owner_id IS NOT NULL;
COMMIT;
