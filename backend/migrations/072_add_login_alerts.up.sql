-- Migration: 072_add_login_alerts (UP)
-- Purpose: Day 77 -- "New login" alerts. A login on a kind of device the
-- account hasn't used lately (browser + system + phone/desktop, as the
-- Sessions screen shows it; no IP addresses are stored) tells the owner.
--   known_devices: the kinds of device each account logged in from, and
--     when last. Sessions are deleted a day after logout, so they can't
--     answer "seen before?". Rows unused for 180 days are deleted by the
--     cleanup job (services/cleanupService.js).
--   notifications.device: the alert's own copy of the device it names
--     ({ browser, os, kind }), since the session may be long gone.

BEGIN;
CREATE TABLE IF NOT EXISTS known_devices (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_key varchar(100) NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_key)
);
CREATE INDEX IF NOT EXISTS idx_known_devices_last_seen ON known_devices (last_seen_at);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS device jsonb;
COMMIT;
