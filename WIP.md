# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 2 — Rate limiter + own posts
**Step:** Day close-out — full browser suite, Progress Log.

## Done this Day
- Step 1 DONE (`30b1dba`): trust proxy for Render.
- Step 2 DONE (`9c78b40`): per-user / per-IP limiter keys (+ b12 flake fix).
- Step 3 DONE (`c1f5faf`): real limiters in a dedicated test.
- Step 4 DONE: own posts in GET /feed.
  - Backend-only: `posts.user_id = $1` (personal posts, every audience);
    own page posts still arrive via page follows, own group posts stay
    in the group. Added `posts.id DESC` tie-breaker (stable pages when
    created_at ties, e.g. seeded rows).
  - Frontend unchanged: CreatePost navigates to `/`, Home remounts and
    refetches; PostCard has no follow button; PostMenu gives own posts
    the owner menu. Prod indexes idx_posts_user_id / idx_posts_created_at
    exist (migration 001); the test fixture omits perf indexes.
  - 6 new API tests; mutation-checked (no own clause → 5 fail; no
    tie-breaker → 1 fails). Backend 263/263.
  - New browser suite `e2e/day2-own-post.cjs` (in run-all): post via the
    real composer → first card on Home in ~0.4 s; EN/MY/AR (RTL),
    light/dark, 375–1280 px, long word, owner menu; 20/20, 0 console
    errors. Related suites a2 b1 b4 b5 b13 b14 all green.

## Progress
- [ ] Full browser suite (run-all.sh)
- [ ] Progress Log entry, clear WIP, commit, push
