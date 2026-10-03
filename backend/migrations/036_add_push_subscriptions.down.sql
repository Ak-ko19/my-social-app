-- Migration: 036_add_push_subscriptions (DOWN)
-- Browsers keep their subscriptions; they just stop receiving pushes.
BEGIN;
DROP TABLE IF EXISTS push_subscriptions;
COMMIT;
