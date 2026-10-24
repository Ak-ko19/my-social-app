-- Migration: 075_add_notification_type_index (UP)
-- Purpose: Day 81 -- the Notifications tabs (Mentions, Follows) read only
-- the kinds they show, newest first, instead of walking all of a person's
-- notifications to find them.

CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created ON notifications (user_id, type, created_at DESC);
