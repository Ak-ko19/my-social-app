-- Migration: 070_add_comments_post_id_index (DOWN)

BEGIN;
DROP INDEX IF EXISTS idx_comments_post_id_id;
COMMIT;
