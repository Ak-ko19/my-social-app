-- Migration: 062_add_group_notifications (UP)
-- Purpose: Day 50 -- group notifications: "X asked to join <group>" to
-- its admins and "You're now a member of <group>" to the person let in,
-- with a "Groups" switch in notification settings (on by default).

BEGIN;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE;
-- The cascade when a group is deleted, and clearing a handled request's notifications.
CREATE INDEX IF NOT EXISTS idx_notifications_community ON notifications (community_id) WHERE community_id IS NOT NULL;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS groups BOOLEAN NOT NULL DEFAULT true;
COMMIT;
