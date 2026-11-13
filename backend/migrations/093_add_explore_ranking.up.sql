-- Migration: 093_add_explore_ranking (UP)
-- Purpose: Day 113 (performance round 3) -- Explore's popular posts come
-- from a ranked list the server keeps fresh, not from scoring every post
-- of the last 7 days on every request.
--
-- explore_ranking holds the top public posts of the week, best first
-- (services/exploreRankingService rebuilds it every couple of minutes; each
-- request reads one page of it and checks every rule again for its viewer).
-- UNLOGGED: it is a cache that can always be rebuilt from posts, likes and
-- comments, so it writes no WAL on every rebuild (the free database plan
-- counts history), and after a crash or restart it simply starts empty --
-- explore_ranking_state is unlogged too, so the next read rebuilds both.

BEGIN;

CREATE UNLOGGED TABLE IF NOT EXISTS explore_ranking (
  post_id integer PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  score double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_explore_ranking_rank ON explore_ranking (rank);

-- One row: when the list was last rebuilt (none yet = never).
CREATE UNLOGGED TABLE IF NOT EXISTS explore_ranking_state (
  id boolean PRIMARY KEY DEFAULT true CONSTRAINT chk_explore_ranking_state_one CHECK (id),
  refreshed_at timestamptz NOT NULL
);

COMMIT;
