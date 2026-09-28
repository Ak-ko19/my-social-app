# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 2 — Rate limiter + own posts
**Step:** 3 — Enable rate limiting in a dedicated test so this bug cannot return (7 users must not block each other).

## Done this Day
- Step 1 DONE (`30b1dba`): trust proxy for Render.
- Step 2 DONE (`9c78b40`): per-user / per-IP limiter keys (+ b12 flake fix).

## Plan
- Root cause of the audit miss: `createLimiter` returns a passthrough under
  NODE_ENV=test, so no test ever ran a real limiter.
- `RATE_LIMIT_IN_TESTS=1` → real limiters even under NODE_ENV=test. Read
  at limiter creation (module load). Outside tests limiters are always
  on, so the flag is meaningless there. Default stays off, so the other
  27 suites are unaffected.
- `tests/api/rateLimit.test.js`: sets the flag + RENDER=true (trust proxy
  1 hop) before `setupTestApp()`, restores env afterwards.
  - Users are created with their own X-Forwarded-For IPs (the signup
    limiter is 10/h per IP).
  - One DB reset for the whole file (not per test): the limiter store
    lives for the file, so each case uses its own IPs/users and IDs must
    not repeat.
  - Cases:
    1. 7 users on 7 IPs, one wrong password each → all 401; then all
       log in (the audit's scenario).
    2. One IP: 5 wrong → 401, 6th → 429 + Retry-After 900 + message;
       switching tokens doesn't reset it; another IP still logs in.
    3. Spoofed X-Forwarded-For prefixes don't escape the login limit.
    4. Global 300/15min per user: alice exhausts hers → 429 (also from
       another IP); bob, anonymous and a forged token on the same IP → 200.
    5. Follow 60/15min per user across rotating IPs; another user on the
       same IP unaffected.
    6. Guard: without the flag, limiters stay off under NODE_ENV=test.
- Performance: ~400 requests, all in-process via supertest.

## Progress
- [x] RATE_LIMIT_IN_TESTS switch
- [x] rateLimit.test.js (6 tests, ~5 s)
- [x] Mutation checks: TRUST_PROXY=0 → 5/6 fail; global keyed by IP →
  1/6 fails. So the test really guards both bugs.
- [x] Backend suite x2: 257/257 both runs
- [x] a2-walkthrough 22/22; diff review clean
- STEP 3 DONE
