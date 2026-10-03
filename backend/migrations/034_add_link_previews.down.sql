-- Migration: 034_add_link_previews (DOWN)
-- Only a cache: nothing is lost that can't be fetched again.
BEGIN;
DROP TABLE IF EXISTS link_previews;
COMMIT;
