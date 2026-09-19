-- Migration: 004_add_users_last_seen (DOWN)
ALTER TABLE users DROP COLUMN IF EXISTS last_seen;
