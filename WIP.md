# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 2 — Rate limiter + own posts
**Step:** 1 — Set `trust proxy` correctly for Render so each client IP is seen.

## Plan
- Stack: Express 5.2.1, express-rate-limit 8.7.0. `server.js` never sets
  `trust proxy`, so behind Render's proxy `req.ip` = the proxy, and every
  client shares one limiter bucket (audit bug #1, Critical).
- New `backend/config/trustProxy.js` → `resolveTrustProxy(env)`:
  - `TRUST_PROXY` set → must be a non-negative integer hop count
    (0 = off). Anything else throws at startup with a clear message.
  - Otherwise: 1 hop when `RENDER=true` (Render sets it automatically) or
    `NODE_ENV=production`; else `false` (local dev has no proxy).
  - Never `true`: that trusts the whole X-Forwarded-For chain, so a client
    could spoof its IP and dodge or poison limits (express-rate-limit
    also rejects it with ERR_ERL_PERMISSIVE_TRUST_PROXY).
- `server.js`: `app.set('trust proxy', resolveTrustProxy(process.env))`
  right after `express()`.
- Security: with 1 hop, `req.ip` = the rightmost X-Forwarded-For entry
  (added by Render), so client-prepended fake entries are ignored.
- Tests (`tests/api/trustProxy.test.js`):
  - resolver: defaults, Render, production, override, 0, invalid values;
  - the server's app is wired to the resolver (the compiled
    `trust proxy fn` trusts exactly 1 hop under RENDER=true);
  - behaviour: with 1 hop, a spoofed X-Forwarded-For prefix is ignored
    and the real client IP is used; with trust off, XFF is ignored.
- Docs: `TRUST_PROXY` in `.env.example` (name + explanation only).
- Not in this step: per-user keys (step 2), limiter test (step 3).

## Progress
- [x] config/trustProxy.js
- [x] server.js wiring
- [x] tests (9 new, pass)
- [x] .env.example
- [x] Full backend suite: 242/242 (27 suites)
- [x] Real-server probe (non-test mode, limiters ON, e2e DB):
  fix → 7 IPs all 401, same IP 6th → 429, spoofed prefix still 429,
  fresh client 200; TRUST_PROXY=0 control reproduces the bug (strangers
  lock out a correct login). Invalid TRUST_PROXY refuses to start.
- [x] 1 hop matches Render's setup per public fixes; Day 6 checklist
  must include a post-deploy check (two networks, wrong logins).
- [x] Diff review: clean, no debug code
- [x] Browser suites (run-all.sh): ALL PASSED — 19 suites / 301 checks,
  A3 visual 222/222 in EN, MY, AR
- STEP 1 DONE (committed with the owner's new VERIFY/foreground-test rule)
