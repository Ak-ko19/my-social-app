-- Migration: 091_add_birthday_notifications (UP)
-- Purpose: Day 111 -- "Today is X's birthday" to X's friends, in each
-- friend's own morning. Its setting, on unless turned off.

BEGIN;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS birthdays boolean NOT NULL DEFAULT true;
COMMIT;
