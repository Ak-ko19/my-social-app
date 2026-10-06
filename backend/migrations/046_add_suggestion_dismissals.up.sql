-- Migration: 046_add_suggestion_dismissals (UP)
-- Purpose: Day 39 -- hide someone from "People you may know" (the X on a
-- suggestion). Private to the person who hid them; it doesn't block,
-- unfollow or notify anyone.

BEGIN;
CREATE TABLE IF NOT EXISTS suggestion_dismissals (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dismissed_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dismissed_user_id)
);
-- The PK covers "who did I hide"; this covers the cascade when the hidden
-- person's account is deleted.
CREATE INDEX IF NOT EXISTS idx_suggestion_dismissals_dismissed ON suggestion_dismissals (dismissed_user_id);
COMMIT;
