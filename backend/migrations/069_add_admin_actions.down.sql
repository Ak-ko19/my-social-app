-- Migration: 069_add_admin_actions (DOWN)

BEGIN;
DROP TABLE IF EXISTS admin_actions;
COMMIT;
