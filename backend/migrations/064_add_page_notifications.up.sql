-- Migration: 064_add_page_notifications (UP)
-- Purpose: Day 53 -- "X made you an admin of <page>", with a "Pages"
-- switch in notification settings (on by default).

BEGIN;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE;
-- The cascade when a page is deleted.
CREATE INDEX IF NOT EXISTS idx_notifications_page ON notifications (page_id) WHERE page_id IS NOT NULL;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS pages BOOLEAN NOT NULL DEFAULT true;
COMMIT;
