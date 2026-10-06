-- Migration: 049_add_search_history (UP)
-- Purpose: Day 42 -- recent searches, like Facebook/Instagram. One row per
-- distinct query per person (searching it again moves it to the top);
-- only the newest 20 are kept (the API prunes on every save). Visible only
-- to its owner; deleted with the account.

BEGIN;
CREATE TABLE IF NOT EXISTS search_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query VARCHAR(100) NOT NULL CHECK (query <> ''),
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The same query in any case is one entry (the upsert's conflict target).
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_history_user_query ON search_history (user_id, LOWER(query));
-- A person's list, newest first.
CREATE INDEX IF NOT EXISTS idx_search_history_user_recent ON search_history (user_id, searched_at DESC);
COMMIT;
