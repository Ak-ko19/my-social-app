-- Migration: 061_add_community_bans (DOWN)

BEGIN;
DROP TABLE IF EXISTS community_bans;
COMMIT;
