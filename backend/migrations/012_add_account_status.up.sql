-- Migration: 012_add_account_status (UP)
-- Purpose: Deactivate/reactivate support. Deactivating is a soft flag (the
-- row and all content stay intact) -- distinct from DELETE /profile's hard
-- delete (013_cascade_account_delete.up.sql), which actually removes the row.

ALTER TABLE users ADD COLUMN is_deactivated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMPTZ;
