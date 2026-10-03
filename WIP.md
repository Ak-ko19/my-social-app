# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 23 — Notification settings
**Step:** —

## Carry-over notes
- GO LIVE is an owner action (no production access): GO_LIVE_CHECKLIST.md,
  LATER.md #2. Before each future GO LIVE day, run
  `cd e2e && bash golive-rehearsal.sh --old` (it picks up new migrations
  and checks the checklist's migration list).
- Any new migration: up + down files, update tests/fixtures/schema.sql
  (+ testDb TABLES), GO_LIVE_CHECKLIST loop, and the rehearsal must pass.
- Logging: use utils/logger (a test forbids console.* in backend
  sources); 500s via sendServerError so they reach the error log.
- Suites that need the production build go in DIST_SUITES (run-all.sh);
  ones that need the real bot checks in BOT_SUITES; Turnstile-on ones in
  TURNSTILE_SUITES.
- Day 11: bot checks (form token, honeypot, login delay) are OFF under
  NODE_ENV=test unless BOT_CHECKS_IN_TESTS=1. Suites that sign users up
  straight through the API only work on the default stack.
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
- GO_LIVE_CHECKLIST edits: use the Edit tool, never a node/heredoc
  script — `\n` inside a quoted heredoc lands as a literal "\n" (bit
  twice, Days 10 and 12; the rehearsal catches it).
- Mutation checks edit backend files: never run them while a browser
  stack is starting (Day 12 crash). Jest files that send many DMs:
  `beforeEach(resetMessageRateLimits)` (services/rateLimiter.js).
- Playwright gotcha seen 4× now: getByRole/getByLabel/getByText name
  matching is a SUBSTRING match — use `exact: true` when one label is
  contained in another.

- This machine has 8 GB RAM (~2 GB free): run long browser runs in
  the foreground in E2E_ONLY batches; a background run got killed.

- Follow-up from Day 16: routes have no auth guard; auth-only screens
  (Admin, EditPage, ManageCommunity, …) re-render briefly with no token
  on a forced logout. Consider a route-level guard (Day 20 a11y/quality
  or Day 25 security round).
- Internet drops break suites via Google Fonts errors: re-run the batch.

- Day 30 Privacy Policy: mention that the server fetches linked pages
  for previews (sites see our server, not the reader) and that share
  cards show public posts to link-preview crawlers.

## Plan
Day 23 — notification settings: likes/comments/mentions/follows/
follow_accepted switches exist (B11). Missing: "messages" and muting a
conversation.
- Migration 037: notification_preferences.messages (default true);
  conversation_participants.muted_until timestamptz (NULL = not muted,
  'infinity' = until unmuted).
- notificationService CATEGORIES += 'messages' (no notification type maps
  to it: message notifications are pushes, Day 22).
- PUT /conversations/:id/mute { duration: '8h' | '1w' | 'always' | null }
  (participants only; null = unmute). /conversations (direct + group) and
  /conversations/:id return muted + muted_until for the viewer.
- pushNewMessage skips recipients with messages off or the conversation
  muted. Unread badges unchanged (like other apps).
- UI: "Messages" row in Notification settings; in a chat a bell button
  in the header opens Mute (8 hours / 1 week / until I turn it back on)
  or Unmute; a muted chat shows a bell-off icon in the inbox. EN/MY/AR.
- Tests: jest (validation, participants only, expiry, push skipped for
  muted/messages-off, list flags), vitest (mute sheet), browser suite.

## Progress
- Step DONE: messages setting + mute a chat. Verified: backend 559/559
  (mute 7 tests, 3 mutations caught); vitest 60; rehearsal 015→037;
  day23-mute 16/16; b9/b10/b11 (count updated 5->6)/b13/a2/day12/day22.
- Next: Day 23 close (full browser run).
