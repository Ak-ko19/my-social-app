-- Migration: 074_add_onboarding (DOWN)

BEGIN;
ALTER TABLE users DROP COLUMN IF EXISTS onboarded_at;
COMMIT;
