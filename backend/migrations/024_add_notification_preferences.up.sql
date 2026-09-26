-- Migration: 024_add_notification_preferences (UP)
-- Purpose: B11 -- choose which notifications to receive. One row per user,
-- created on first save; NO row means "everything on", so no backfill is
-- needed and existing users keep getting every notification.
--
-- Columns are categories, not raw types (see services/notificationService
-- CATEGORY_BY_TYPE): likes (like + comment_like), comments (comment +
-- reply), mentions, follows (follow + follow_request), follow_accepted.

BEGIN;

CREATE TABLE notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  likes BOOLEAN NOT NULL DEFAULT true,
  comments BOOLEAN NOT NULL DEFAULT true,
  mentions BOOLEAN NOT NULL DEFAULT true,
  follows BOOLEAN NOT NULL DEFAULT true,
  follow_accepted BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
