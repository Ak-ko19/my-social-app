-- Migration: 090_add_birthdays (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_users_birthday;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_birthday_both;
ALTER TABLE users DROP COLUMN IF EXISTS birthday_audience;
ALTER TABLE users DROP COLUMN IF EXISTS birthday_day;
ALTER TABLE users DROP COLUMN IF EXISTS birthday_month;
COMMIT;
