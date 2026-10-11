-- Migration: 065_add_events (DOWN)

BEGIN;
DROP TABLE IF EXISTS event_responses;
DROP TABLE IF EXISTS events;
COMMIT;
