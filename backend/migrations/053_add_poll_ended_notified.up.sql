-- Migration: 053_add_poll_ended_notified (UP)
-- Purpose: Day 45 -- "poll ended" notifications (to the author and the
-- voters, like X), sent once by the server's 30 s ticker. Polls that had
-- already ended before this migration count as notified, so deploying it
-- doesn't send a burst of notifications about old polls.

BEGIN;
ALTER TABLE polls ADD COLUMN IF NOT EXISTS ended_notified BOOLEAN NOT NULL DEFAULT false;
UPDATE polls SET ended_notified = true WHERE closes_at <= now();
-- The ticker's queue: ended polls nobody was told about yet.
CREATE INDEX IF NOT EXISTS idx_polls_end_queue ON polls (closes_at) WHERE NOT ended_notified;
COMMIT;
