-- Migration: 063_add_page_admins (DOWN)
-- Admins lose access; their page posts were always the owner's.

BEGIN;
DROP TABLE IF EXISTS page_admins;
COMMIT;
