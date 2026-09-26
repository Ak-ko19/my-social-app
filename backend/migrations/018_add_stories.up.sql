-- Migration: 018_add_stories (UP)
-- Purpose: B3 Stories -- one image each, visible for 24 hours.
-- Expiry is enforced at QUERY time (every read filters
-- expires_at > now()), so an expired story disappears the moment it
-- expires with no cron needed. Expired rows stay in the table (harmless;
-- a later cleanup job can prune them).
--
-- story_views records who has seen which story, for the tray's
-- seen/unseen ring. Both tables cascade on user/story deletion.

BEGIN;

CREATE TABLE stories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- The tray query: "active stories of these users".
CREATE INDEX idx_stories_user_expires ON stories (user_id, expires_at);

CREATE TABLE story_views (
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

-- Cascade on viewer (account) deletion.
CREATE INDEX idx_story_views_viewer ON story_views (viewer_id);

COMMIT;
