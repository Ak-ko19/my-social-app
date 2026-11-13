-- Migration: 093_add_explore_ranking (DOWN)
-- Back to scoring the week's posts per request. Nothing is lost: the
-- ranking is rebuilt from posts, likes and comments.

BEGIN;

DROP TABLE IF EXISTS explore_ranking_state;
DROP TABLE IF EXISTS explore_ranking;

COMMIT;
