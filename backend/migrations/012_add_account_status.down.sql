-- Migration: 012_add_account_status (DOWN)
ALTER TABLE users DROP COLUMN IF EXISTS deactivated_at;
ALTER TABLE users DROP COLUMN IF EXISTS is_deactivated;
