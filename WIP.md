# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 22 — Push notifications
**Step:** 1 — Web push (VAPID)

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
Day 22 — web push (VAPID, existing PWA service worker /sw.js).
- Off until the owner sets VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+
  VAPID_SUBJECT mailto:) on Render; keys are generated locally with
  `npx web-push generate-vapid-keys` — no account (LATER item). env.js
  warns on a partial setup. Like Turnstile.
- Migration 036 push_subscriptions (user_id FK cascade, endpoint UNIQUE,
  p256dh, auth, user_agent, created_at, last_success_at).
- API (auth): GET /push/config {publicKey|null}; POST /push/subscribe
  {endpoint, keys}; DELETE /push/subscribe {endpoint}. Logout and
  account deletion drop the device's subscription.
- SSRF: the endpoint is user-supplied and the server POSTs to it ->
  https only, host must be a known browser push service (FCM, Mozilla,
  Apple, Microsoft WNS); key formats checked; max 10 per user.
- Sending (services/pushService.js, web-push lib, fire-and-forget):
  - after notificationService.notify / mention inserts (so B11
    settings apply);
  - new DMs from messageService.createMessage, only to participants who
    are offline (no live socket) — no buzzing someone in the app;
  - text in the recipient's users.language (EN/MY/AR), never message
    content (lock screen privacy): "alice sent you a message";
  - 404/410 from the push service -> subscription deleted.
- SW: push -> showNotification (icon, tag per conversation/post, data
  url); notificationclick -> focus an open tab or open the url.
- Settings → Notifications: "Push notifications on this device" switch
  (asks permission; hidden when unsupported or the server has no keys).
- Tests: jest with web-push mocked (validation/SSRF allow-list, sends
  after notify, prefs respected, offline-only for DMs, language, 410
  cleanup); vitest switch; browser: dist stack with test VAPID keys, a
  fake PushManager + a local stub push endpoint (test-only origin).

## Progress
- Step 1 DONE: web push. Verified: backend 552/552 (push 14 tests, 8
  mutations caught after adding look-alike hosts); vitest 60/60;
  rehearsal 015→036; day22-push 11/11 end to end (real encryption to a
  stub push service, SW shows it) + a2/b4/b9/b10/b11/day8 green.
  Found while building: the web-push lib only speaks https -> we build
  the request with it and send it ourselves (https only in production).
- Next: Day 22 close (full browser run in batches).
