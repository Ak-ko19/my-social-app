-- Migration: 008_add_reports (UP)
-- Purpose: Support reporting a post or a user for moderation review.
-- target_id is a polymorphic reference (either a posts.id or a users.id
-- depending on target_type) -- Postgres has no native polymorphic FK, so
-- existence of the target is validated at the application layer
-- (reportController.createReport) instead of a DB constraint, same
-- tradeoff every polymorphic-association schema makes. No admin dashboard
-- exists yet (out of scope for this feature per spec) -- status is just
-- stored so a future moderation view has somewhere to read/write it.
--
-- Brand-new, empty table -- transactional, same as 003/005/006.

BEGIN;

CREATE TYPE report_target_type AS ENUM ('post', 'user');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed');

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type report_target_type NOT NULL,
  target_id INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL,
  details TEXT,
  status report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A future moderation queue reads "pending reports for this target" --
-- composite index serves that directly. Partial (status = 'pending') keeps
-- it small since reviewed reports don't need fast lookup the same way.
CREATE INDEX idx_reports_target_pending ON reports (target_type, target_id) WHERE status = 'pending';

-- Rate-limit/abuse-check lookups ("how many reports has this user filed
-- recently") and a reporter's own report history both filter by this.
CREATE INDEX idx_reports_reporter_id ON reports (reporter_id, created_at DESC);

COMMIT;
