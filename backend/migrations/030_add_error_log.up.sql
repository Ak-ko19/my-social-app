-- Migration: 030_add_error_log (UP)
-- Purpose: Day 10 built-in error log (services/errorLogService.js).
-- ONE row per distinct error ("group"), not one per occurrence: repeats
-- bump count/last_seen, so a crash loop can't fill the database. The
-- fingerprint is a hash of where it happened + the message with volatile
-- parts (ids, numbers) normalised. A group marked resolved re-opens by
-- itself if the error happens again. The Day 9 cleanup job prunes groups
-- not seen for 90 days.

BEGIN;
CREATE TABLE error_groups (
  fingerprint CHAR(40) PRIMARY KEY,
  source VARCHAR(10) NOT NULL CHECK (source IN ('api', 'socket', 'process', 'client')),
  route TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  status INTEGER,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_error_groups_last_seen ON error_groups (last_seen DESC);
COMMIT;
