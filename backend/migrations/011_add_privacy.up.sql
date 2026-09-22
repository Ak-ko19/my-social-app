-- Migration: 011_add_privacy (UP)
-- Purpose: Public/private account toggle. Private means only approved
-- (status = 'accepted') followers can see the account's posts, and a new
-- follow request lands as 'pending' instead of auto-accepting -- the owner
-- must approve or deny it (see follow-requests routes).
--
-- follows.status defaults to 'accepted' so every EXISTING row (all created
-- under the old always-auto-accept behavior) is unaffected -- this is
-- additive, not a backfill/behavior change for accounts that stay public.

BEGIN;

ALTER TABLE users ADD COLUMN is_private BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE follow_status AS ENUM ('accepted', 'pending');
ALTER TABLE follows ADD COLUMN status follow_status NOT NULL DEFAULT 'accepted';

-- The "who's waiting on my approval" list (GET /follow-requests) filters by
-- (following_id, status = 'pending') -- this is that query's index.
CREATE INDEX idx_follows_following_status ON follows (following_id, status);

COMMIT;
