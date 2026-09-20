-- Migration: 005_add_voice_message_support (DOWN)
-- Reverses 005_add_voice_message_support.up.sql.
--
-- NOTE: restoring `content`'s NOT NULL constraint (step below) fails if any
-- voice message (content IS NULL, type = 'voice') has been inserted since
-- the up migration ran. That failure is intentional -- this rollback undoes
-- the SCHEMA change, not a data migration, so it must not silently delete
-- real voice messages just to make the column NOT NULL again. If that
-- happens, either delete/backfill those rows manually first, or don't roll
-- this migration back while voice messages exist.

BEGIN;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS chk_messages_type_fields;
ALTER TABLE messages ALTER COLUMN content SET NOT NULL;
ALTER TABLE messages DROP COLUMN IF EXISTS type;
ALTER TABLE messages DROP COLUMN IF EXISTS media_url;
ALTER TABLE messages DROP COLUMN IF EXISTS duration_seconds;
DROP TYPE IF EXISTS message_type;

COMMIT;
