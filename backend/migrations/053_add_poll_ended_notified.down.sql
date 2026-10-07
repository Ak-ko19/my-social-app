-- Migration: 053_add_poll_ended_notified (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_polls_end_queue;
ALTER TABLE polls DROP COLUMN IF EXISTS ended_notified;
COMMIT;
