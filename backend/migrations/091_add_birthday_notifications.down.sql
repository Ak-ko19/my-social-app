-- Migration: 091_add_birthday_notifications (DOWN)

BEGIN;
DELETE FROM notifications WHERE type = 'birthday';
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS birthdays;
COMMIT;
