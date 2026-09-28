# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 3 — Startup safety + small bugs
**Step:** 1 — Validate all required env vars at startup with a clear error message; read PORT from env.

## Carry-over notes
- Day 6 GO_LIVE_CHECKLIST.md must include: after deploy, a rate-limit
  check from two networks (wrong logins on one must not lock the other),
  the only way to confirm Render's one-hop proxy setting.

## Plan
- New `backend/config/env.js` → `checkEnv(env)` returns
  `{ errors, warnings }` (pure, testable); `assertEnv()` prints them and
  exits 1 on errors.
- Production = NODE_ENV=production OR RENDER=true (same as trustProxy).
- Errors (refuse to start):
  - DATABASE_URL missing/blank, or not a postgres:// / postgresql:// URL
  - JWT_SECRET missing/blank
  - PORT set but not an integer 0–65535
  - TRUST_PROXY invalid (reuse resolveTrustProxy's error)
  - production only: ALLOWED_ORIGINS and FRONTEND_URL missing (both
    silently fall back to localhost today → broken CORS / email links)
  - ALLOWED_ORIGINS / FRONTEND_URL present but not a bare http(s) origin
    (trailing slash or path = classic silent CORS mismatch)
- Warnings (start anyway):
  - production: JWT_SECRET shorter than 32 chars (can't see prod's value;
    refusing to start could take the site down for no real gain)
  - Cloudinary partly configured (some of the 3 vars); production with
    none → uploads disabled
  - Email partly configured (HOST/USER/PASS)
- Messages name the variable and say what to do; never print values.
- server.js: `assertEnv()` right after dotenv, only when run directly
  (tests require the module and never start the server). Port:
  `process.env.PORT || 3000`; log the actual bound port.
- Render safety: a failed start keeps the previous deploy serving, so
  fail-fast turns a missing var into a visible failed deploy, not an
  outage. GO LIVE checklist lists the names.
- Tests: `tests/api/env.test.js` — unit cases for every rule + a real
  `node server.js` spawn: missing JWT_SECRET → exit 1 with the message;
  valid env + PORT=0 → starts and prints the bound port.
- Docs: `.env.example` gets PORT (optional) and notes which vars are
  required in production.

## Progress
- [x] config/env.js
- [x] server.js wiring + PORT (fixed own bug found in review: `Number(PORT)
  || 3000` ignored PORT=0; test now asserts the port isn't 3000)
- [x] tests: 13 (rules, no secret echoed, .env.example passes, 3 real
  `node server.js` spawns)
- [x] .env.example: required vars documented, PORT added
- [x] Backend 276/276; a2 22/22; real broken-config output reviewed
- STEP 1 DONE
