-- Migration: 021_add_message_image_type (DOWN)
-- Intentionally a no-op: Postgres has no ALTER TYPE ... DROP VALUE. An
-- unused 'image' label in the enum is harmless once 022 is rolled back
-- (022's DOWN deletes image messages and restores the old CHECK).
SELECT 1;
