-- Migration: 036_add_push_subscriptions (UP)
-- Purpose: Day 22 -- web push. One row per browser/device that turned push
-- notifications on (the PushSubscription from the service worker). The
-- endpoint is unique: re-subscribing the same browser updates its row.
-- A push service answering 404/410 means the subscription is gone; the row
-- is deleted then (services/pushService.js).

BEGIN;
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
COMMIT;
