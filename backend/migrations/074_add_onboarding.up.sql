-- Migration: 074_add_onboarding (UP)
-- Purpose: Day 78 -- first-run steps for new accounts (language, profile
-- photo, people to follow, a short tour), shown once after the first
-- login. users.onboarded_at: when the account finished or skipped them
-- (NULL = not yet). Accounts that already exist are marked done as of when
-- they were created, so only accounts made after this see the steps.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
UPDATE users SET onboarded_at = COALESCE(created_at, now()) WHERE onboarded_at IS NULL;
COMMIT;
