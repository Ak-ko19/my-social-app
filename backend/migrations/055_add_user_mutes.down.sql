-- Migration: 055_add_user_mutes (DOWN)

BEGIN;
DROP TABLE IF EXISTS user_mutes;
COMMIT;
