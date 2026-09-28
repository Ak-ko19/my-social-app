# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 2 — Rate limiter + own posts
**Step:** 2 — Rate-limit authenticated routes per user ID, anonymous routes per IP.

## Done this Day
- Step 1 DONE (`30b1dba`): trust proxy for Render.

## Plan
- Why: after step 1 each IP has its own bucket, but many real users share
  one IP (mobile carrier CGNAT, campus/office Wi-Fi). Per-IP budgets for
  logged-in traffic throttle whole networks; per-user budgets follow the
  account instead.
- `middleware/rateLimiter.js`, `createLimiter({ keyBy })`:
  - `'ip'`   → `ip:<ipKeyGenerator(req.ip)>` (IPv6 grouped per /56, the
    library's own default, so one host can't rotate addresses).
  - `'user'` → `user:<req.userId>`; used only behind authMiddleware; if
    userId is somehow missing, falls back to the IP key (never a shared
    `user:undefined` bucket).
  - `'userOrIp'` → verifies the Bearer JWT (jwt.verify, never decode —
    an unverified token would let anyone invent user IDs and get fresh
    buckets); valid → user key, otherwise IP key.
  - Key prefixes keep user 7 and IP "7..." from ever colliding.
- Mapping:
  - global (runs before auth) → `userOrIp`
  - login, signup, forgot-password, reset-password → `ip` ALWAYS
    (credential-guessing / account-creation surfaces; a token must not
    move an attacker to a different bucket)
  - follow, report, account actions, resend-verification → `user`
- No message or status changes → frontend + MY/AR translations unchanged.
- Socket.io sends already have their own per-(user, conversation) limit.
- Tests: key functions (valid/invalid/expired/wrong-secret/malformed
  token, no header, IPv6 grouping, missing userId, no collisions) and
  that createLimiter rejects an unknown keyBy. Limiter-on integration
  tests belong to step 3.
- Verify: real-server probe with limiters ON — two users behind one IP
  get separate global budgets; anonymous traffic from that IP has its
  own; login stays per-IP even with a token; follow is per user.

## Progress
- [x] key functions + keyBy option
- [x] limiter mapping
- [x] tests (9 new)
- [x] Backend suite 251/251
- [x] Probe (limiters ON): login per IP even when switching tokens;
  follow per user even when rotating IPs; global per user (her 429
  follows her to another IP; bob / anonymous / forged token on the same
  IP unaffected); 0 limiter validation warnings
- [x] Related browser suites: a2 22/22, b11 9/9, b12 13/13
- [x] FIX: b12 was flaky (3/7 runs): dave's in-flight Socket.io poll got
  a 400 "Session ID unknown" when his ban dropped the socket, before the
  suite's expected-error window. Allowed 400/401 on dave's tab only from
  the ban click on. 5/5 green after.
- STEP 2 DONE
