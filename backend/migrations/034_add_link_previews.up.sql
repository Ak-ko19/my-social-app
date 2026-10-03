-- Migration: 034_add_link_previews (UP)
-- Purpose: Day 19 -- cache of link previews (services/linkPreviewService.js)
-- so a page is fetched once, not once per viewer. Keyed by the SHA-256 of
-- the normalised URL. ok = false caches a failure (for an hour) so a dead
-- link isn't hammered. The Day 9 cleanup job drops rows after 30 days.

BEGIN;
CREATE TABLE IF NOT EXISTS link_previews (
  url_hash CHAR(64) PRIMARY KEY,
  url TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  title TEXT,
  description TEXT,
  site_name TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_previews_fetched_at ON link_previews (fetched_at);
COMMIT;
