-- Migration: 014_add_email_verification (UP)
-- Purpose: Email verification. Same token pattern as reset_token/
-- reset_token_expiry (authController already hashes reset tokens with
-- SHA-256 before storage -- this reuses that exact approach for
-- verification tokens too, not a new scheme).
--
-- Plain (non-CONCURRENTLY) index: unlike 001's indexes (added against a
-- live table via the run-migration.js script executed statement-by-statement
-- through psql), this whole file runs as a single multi-statement query
-- through node-postgres, which wraps it in one implicit transaction --
-- CONCURRENTLY cannot run inside a transaction block. `users` is small
-- enough in this environment that a plain index's brief lock is a
-- non-issue; CONCURRENTLY is reserved for tables where it actually matters.

BEGIN;

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN verification_token TEXT;
ALTER TABLE users ADD COLUMN verification_token_expiry TIMESTAMPTZ;

CREATE INDEX idx_users_verification_token ON users (verification_token) WHERE verification_token IS NOT NULL;

COMMIT;
