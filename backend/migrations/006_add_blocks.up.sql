-- Migration: 006_add_blocks (UP)
-- Purpose: Support user-to-user blocking. A block is one-directional in
-- storage (blocker_id -> blocked_id) but enforced bidirectionally at the
-- application layer (blockService.isBlocked checks both directions) --
-- mutual invisibility, follow/DM prevention, etc. don't care who blocked
-- whom, only that a block exists between the two users.
--
-- Brand-new, empty table (no live traffic on it yet) -- same reasoning as
-- 003/005 for running this in a transaction instead of CONCURRENTLY.

BEGIN;

CREATE TABLE blocks (
  id SERIAL PRIMARY KEY,
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_blocks_not_self CHECK (blocker_id <> blocked_id)
);

-- Prevents blocking the same user twice, and is also the lookup path for
-- "did I block this user" (blocker_id, blocked_id order).
CREATE UNIQUE INDEX idx_blocks_blocker_blocked ON blocks (blocker_id, blocked_id);

-- Reverse-direction lookup: "has this user blocked me" / bidirectional
-- isBlocked() checks both directions on every feed/follow/message request,
-- so both directions need an index, not just the unique one above.
CREATE INDEX idx_blocks_blocked_id ON blocks (blocked_id);

COMMIT;
