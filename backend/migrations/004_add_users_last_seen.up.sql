-- Migration: 004_add_users_last_seen (UP)
-- Purpose: Socket.io presence tracking needs somewhere to record when a user
-- was last connected, so the disconnect handler can update it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
