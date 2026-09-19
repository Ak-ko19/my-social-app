-- Migration: 003_upgrade_dm_schema (DOWN)
-- Reverses 003_upgrade_dm_schema.up.sql. Safe to run as long as
-- messages_dm_legacy (created by the up migration) still exists -- if it was
-- manually dropped in a later cleanup step, this rollback is no longer possible
-- and the legacy DM data must be restored from a database backup instead.
--
-- Any messages/conversations created through the NEW schema after the up
-- migration ran (i.e. real usage of the new DM feature) are discarded here,
-- since they have no representation in the old sender_id/receiver_id shape.

BEGIN;

DROP TABLE IF EXISTS conversation_participants;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TYPE IF EXISTS message_status;
DROP TYPE IF EXISTS conversation_type;

ALTER TABLE messages_dm_legacy RENAME TO messages;

COMMIT;
