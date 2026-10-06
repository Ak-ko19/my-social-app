-- Migration: 046_add_suggestion_dismissals (DOWN)
-- Hidden suggestions can show up again.
BEGIN;
DROP TABLE IF EXISTS suggestion_dismissals;
COMMIT;
