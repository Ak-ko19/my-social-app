-- Migration: 077_add_memories_notifications (UP)
-- Purpose: Day 84 -- "You have memories from 3 years ago", once a day in
-- each person's own morning.
--   users.time_zone: the IANA zone the app last reported (PUT
--     /profile/time-zone); NULL = never reported (UTC is assumed).
--   notification_preferences.memories: its off switch.
--   idx_posts_month_day: finds the profile posts made on a month/day in
--     any year without reading every post (posts.created_at holds the
--     database's local time, so the expression is fixed for an index).

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_zone varchar(64);
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS memories boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_posts_month_day ON posts ((extract(month FROM created_at)), (extract(day FROM created_at)))
  WHERE page_id IS NULL AND community_id IS NULL;
COMMIT;
