-- Migration: 076_add_notification_details (DOWN)

ALTER TABLE notifications DROP COLUMN IF EXISTS details;
