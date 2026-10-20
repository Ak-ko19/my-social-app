-- Migration: 072_add_login_alerts (DOWN)

BEGIN;
ALTER TABLE notifications DROP COLUMN IF EXISTS device;
DROP TABLE IF EXISTS known_devices;
COMMIT;
