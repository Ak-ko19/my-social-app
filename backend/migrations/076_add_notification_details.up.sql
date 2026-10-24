-- Migration: 076_add_notification_details (UP)
-- Purpose: Day 82 -- a notification about something that is gone keeps
-- what it needs to say: "We removed your post. Reason: Spam." keeps
-- { kind, reason, excerpt } here (the post itself was deleted). Kept as
-- long as the notification (90 days, cleanupService).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS details jsonb;
