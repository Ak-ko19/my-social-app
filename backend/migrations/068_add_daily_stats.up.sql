-- Migration: 068_add_daily_stats (UP)
-- Purpose: Day 61 -- Admin > Overview. One row per finished day (UTC) with
-- what happened that day, filled by the server's ticker once the day is
-- over, so the dashboard reads a few dozen rows instead of counting
-- months of posts and comments on every visit. Today is counted live.

BEGIN;
CREATE TABLE IF NOT EXISTS daily_stats (
  day date PRIMARY KEY,
  signups integer NOT NULL DEFAULT 0,
  posts integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  reports integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
-- Counting one day (or today so far) by date range.
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments (created_at);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at);
COMMIT;
