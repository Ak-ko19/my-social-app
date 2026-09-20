-- Migration: 005_add_voice_message_support (UP)
-- Purpose: Let a message carry a voice-note payload (Cloudinary-hosted audio
-- URL + duration) instead of plain text, for the upcoming voice-message
-- feature. Additive and backward-compatible: `type` defaults every existing
-- row to 'text', and every row inserted so far already has non-null,
-- non-empty `content` (enforced at the application layer in
-- messageService.sendMessage), so it already satisfies the new CHECK
-- constraint below with no backfill needed.
--
-- Lock behavior on a table that may have live traffic (same concern 001's
-- CONCURRENTLY comment and 003's transaction-wrapping comment are about):
--   - CREATE TYPE and ADD COLUMN ... DEFAULT 'text' NOT NULL are metadata-only
--     on PG 11+ (constant default, no table rewrite), same as 004's
--     ADD COLUMN. ALTER COLUMN content DROP NOT NULL is metadata-only too.
--   - A plain `ADD CONSTRAINT ... CHECK (...)` would hold an ACCESS EXCLUSIVE
--     lock (blocking reads and writes) for as long as it takes to scan and
--     validate every existing row. Adding it NOT VALID instead only takes
--     that lock for the metadata change itself (instant), and the separate
--     VALIDATE CONSTRAINT statement below scans the table under a SHARE
--     UPDATE EXCLUSIVE lock, which does not block concurrent reads/writes.
--   - For that split to actually avoid holding the strong lock for the scan,
--     the ADD CONSTRAINT ... NOT VALID and the VALIDATE CONSTRAINT must run
--     in two SEPARATE transactions, not one. The explicit BEGIN/COMMIT below
--     around only the first part achieves that: per Postgres's simple-query
--     protocol, explicit transaction-control commands in a multi-statement
--     string divide it into multiple transactions, so the trailing
--     VALIDATE CONSTRAINT statement (deliberately left outside the
--     BEGIN/COMMIT) runs in its own transaction after the first commits --
--     this holds even run as a single node scripts/run-migration.js call.

BEGIN;

-- 1. Enum type, same convention as conversation_type/message_status (003).
CREATE TYPE message_type AS ENUM ('text', 'voice');

-- 2. New columns.
ALTER TABLE messages
  ADD COLUMN type message_type NOT NULL DEFAULT 'text',
  ADD COLUMN media_url TEXT,
  ADD COLUMN duration_seconds INTEGER;

-- 3. `content` was NOT NULL under the old text-only schema; a voice message
-- has no text content, so that blanket constraint must be relaxed here --
-- the CHECK constraint below re-enforces "NOT NULL (and non-empty) when
-- type = 'text'" at the row level instead, conditionally.
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- 4. Row-level rule tying type to which of the two payload shapes must be
-- present. NOT VALID here on purpose -- see lock-behavior note above.
ALTER TABLE messages ADD CONSTRAINT chk_messages_type_fields CHECK (
  (type = 'text' AND content IS NOT NULL AND content <> '')
  OR
  (type = 'voice' AND media_url IS NOT NULL AND duration_seconds IS NOT NULL)
) NOT VALID;

COMMIT;

-- Deliberately outside the transaction above -- see lock-behavior note.
ALTER TABLE messages VALIDATE CONSTRAINT chk_messages_type_fields;
