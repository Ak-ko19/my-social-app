# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 8 — Session revocation
**Step:** 1 — Changing the password signs out other devices.

## Plan
- Why sessions (not just token_version): step 2 needs "log out all
  devices" AND an active-sessions list; a counter can't list anything.
- Migration 028_add_sessions (+ down, + tests/fixtures/schema.sql):
  - sessions(id uuid PK default gen_random_uuid(), user_id FK CASCADE,
    created_at, last_seen_at, expires_at, revoked_at, user_agent)
  - partial index (user_id) WHERE revoked_at IS NULL
  - users.tokens_valid_after timestamptz: tokens WITHOUT a session id
    (the 7-day tokens issued before this deploy) issued at/before it are
    dead. Lets password change cut off legacy tokens too, without
    logging everyone out on deploy.
- `services/sessionService.js`:
  - createSession(userId, req) → {sid, token} (JWT {userId, sid}, 7d,
    session expires_at = same 7d)
  - authorize(decoded) → 'ok' | 'banned' | 'invalid' — ONE query joining
    users + sessions (replaces the per-request isBanned query, same cost)
  - revokeOtherSessions(userId, keepSid) + tokens_valid_after = now()
  - kickSockets(userId, keepSid): disconnect that user's live sockets
    except the current session's
- Wire authorize into authMiddleware (req.sessionId), optionalAuth,
  socketAuth (socket.sessionId). Login uses createSession.
- changePassword: after the update, revoke other sessions + cut legacy
  tokens + kick other sockets. If the current request used a legacy
  token (no sid) it would die too → respond with a fresh token for this
  device. Response becomes JSON { message, token? }.
- resetPassword (forgot flow): revoke ALL sessions + legacy tokens + kick
  all sockets.
- Bug fix found while planning: a wrong CONFIRMATION password on change
  password / deactivate / delete answers 401, and the frontend logs out
  on any 401 → mistyping your password logged you out. Now 403 (not
  caught by the logout interceptor).
- Frontend: AccountManagementScreen stores the returned token (if any)
  via the existing auth-change mechanism; SocketProvider reconnects on
  token change already.
- Tests: login token has sid; revoked/expired/unknown session → 401;
  change password → other session REST 401 + socket refused + live
  socket kicked; current session keeps working; legacy token cut off,
  legacy current device gets a working new token; reset → all dead;
  optionalAuth treats revoked as anonymous; wrong confirmation → 403.
- Migration: rehearsal must pass (028 up, schema = fixture, down
  restores, old code still works).

## Progress
- [x] migration 028 + fixture + testDb reset list
- [x] sessionService + wiring (authMiddleware, optionalAuth, socketAuth;
  accountStatusService removed — authorize() replaces isBanned)
- [x] change/reset password + 403 fix (change password, deactivate,
  delete)
- [x] frontend: replaceToken(); success text now says other devices were
  signed out (EN/MY/AR); success message gets role="status"
- [x] tests: sessions.test.js 11 (incl. a real Socket.io server);
  mutation-checked (no revoke → 5 fail, no socket kick → 1, no session
  check → 6). auth.test.js: a deleted account's token is now 401 (was a
  404 from the route) — intended.
- [x] Backend 347/347; lint, i18n, build; rehearsal PASSED with 028 (157
  cols / 93 constraints, old code OK); day8-sessions 14/14 ×3; a2 b9
  b11 b12 b16 green. GO_LIVE_CHECKLIST updated for 028 (+ live check).
- STEP 1 DONE
- Carry-over: Day 9 cleanup job must also delete expired/revoked sessions
  (one row per login).

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations)
  and update the checklist's migration list/loop if migrations were added.
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
