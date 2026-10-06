-- Migration: 049_add_search_history (DOWN)

BEGIN;
DROP TABLE IF EXISTS search_history;
COMMIT;
