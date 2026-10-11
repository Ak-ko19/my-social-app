-- Migration: 065_add_events (UP)
-- Purpose: Day 55 -- events (Facebook's, basic): a host, a time, a place,
-- who's going or interested; reminders later from the ticker.

BEGIN;
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL CONSTRAINT chk_events_name CHECK (length(btrim(name)) > 0),
  description text CONSTRAINT chk_events_description CHECK (description IS NULL OR char_length(description) <= 2000),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ CONSTRAINT chk_events_ends_after CHECK (ends_at IS NULL OR ends_at > starts_at),
  location varchar(200),
  audience varchar(10) NOT NULL DEFAULT 'public' CONSTRAINT chk_events_audience CHECK (audience IN ('public', 'followers')),
  cancelled_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events (starts_at);
CREATE INDEX IF NOT EXISTS idx_events_host ON events (host_id, starts_at);
-- The reminder job's queue: not yet reminded, not cancelled.
CREATE INDEX IF NOT EXISTS idx_events_reminder_due ON events (starts_at) WHERE reminder_sent_at IS NULL AND cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS event_responses (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(10) NOT NULL CONSTRAINT chk_event_responses_status CHECK (status IN ('going', 'interested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
-- "Events I'm going to", and the cascade from a deleted account.
CREATE INDEX IF NOT EXISTS idx_event_responses_user ON event_responses (user_id);
COMMIT;
