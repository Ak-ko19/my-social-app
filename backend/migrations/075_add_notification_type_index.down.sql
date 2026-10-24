-- Migration: 075_add_notification_type_index (DOWN)

DROP INDEX IF EXISTS idx_notifications_user_type_created;
