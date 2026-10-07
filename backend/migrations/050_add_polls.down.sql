-- Migration: 050_add_polls (DOWN)

BEGIN;
DROP TABLE IF EXISTS poll_votes;
DROP TABLE IF EXISTS poll_options;
DROP TABLE IF EXISTS polls;
COMMIT;
