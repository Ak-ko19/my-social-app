-- Migration: 090_add_birthdays (UP)
-- Purpose: Day 111 -- an optional birthday on your profile, and who sees
-- it. Only the month and the day are kept, never the year (nothing here
-- needs an age).
--   birthday_audience: only_me | friends (people who follow each other) |
--     public.
--   idx_users_birthday: the people whose birthday is on a given day (the
--     birthday notifications, step 2).

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_month smallint
  CONSTRAINT chk_users_birthday_month CHECK (birthday_month BETWEEN 1 AND 12);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_day smallint
  CONSTRAINT chk_users_birthday_day CHECK (birthday_day BETWEEN 1 AND 31);
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_audience varchar(10) NOT NULL DEFAULT 'friends'
  CONSTRAINT chk_users_birthday_audience CHECK (birthday_audience IN ('only_me', 'friends', 'public'));
ALTER TABLE users ADD CONSTRAINT chk_users_birthday_both CHECK ((birthday_month IS NULL) = (birthday_day IS NULL));
CREATE INDEX IF NOT EXISTS idx_users_birthday ON users (birthday_month, birthday_day) WHERE birthday_month IS NOT NULL;
COMMIT;
