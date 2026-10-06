# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 31-32 — Messaging upgrade
**Step:** 1 — message reactions

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
- Explore (posts and hashtags) aggregates the last 7 days on every
  request (~5.7k rows read at the perf seed). Fine now; at real scale
  precompute it (a table refreshed by the cleanup job) -- Phase 2.
- Performance: e2e/day27-perf.cjs must stay green; new list queries get
  an index (check with the suite). Any new index goes in the migration,
  the fixture AND the rehearsal compares them. npm run check:bundle
  keeps the first download under 225 kB gz.
- Privacy Policy (legal.privacy in the locales) is written from the
  code: when a feature changes what is collected, shared or kept,
  update it (EN/MY/AR) and its date in LegalScreen.jsx.
- New account-only screens: wrap their route in authOnly() in App.jsx
  and add them to e2e/day30-guard.cjs GUARDED.
- Accessibility: e2e/day26-a11y.cjs must stay at 0 serious/critical.
  Accent colour as TEXT uses --color-accent-text (lighter in dark mode),
  never --color-accent.

- Day 30 Privacy Policy: mention that the server fetches linked pages
  for previews (sites see our server, not the reader) and that share
  cards show public posts to link-preview crawlers.

## Plan
Reply, edit (15 min) and unsend already exist (B9, dm/dmExtras tests):
verified, not rebuilt. Missing: reactions (step 1), forward (step 2).
Step 1 (like Messenger): one reaction per person per message, the same
6 as posts. Migration 040 message_reactions (PK message+user, FK
cascades, CHECK, index user_id). PUT/DELETE
/conversations/:id/messages/:messageId/reaction: participant only (else
403 like the rest of the chat API), message must be in that chat and not
unsent, block check as for sending, own limiter (120/15 min, not the send
budget). Real time: socket message_reaction {conversationId, messageId,
reactions}. Messages carry reactions [{user_id, reaction}] (one query per
page, attached in list/edit; [] on new). Unsend/moderator removal clears
them. No notification (Messenger shows it in the chat only). Data export
gets message_reactions. UI: React button in the bubble actions opens a
6-emoji picker (keyboard, aria-pressed for mine; picking mine again
removes it), chips under the bubble with counts and who reacted
(aria-label/title). Optimistic with rollback. EN/MY/AR, dark, RTL.
Tests: jest (success + 400/403/404, block, unsend clears, socket
broadcast), Vitest (chips/picker), browser suite day31-reactions
(two users live).

## Progress
- Step 1 done: migration 040 message_reactions; PUT/DELETE .../reaction
  (participant, same chat, not unsent -> 409, block -> 403, own limiter);
  socket message_reaction; reactions on list/edit; unsend and moderator
  removal clear them; export lists them. UI: React button, 6-emoji
  picker (keyboard, Escape, outside click; opens below when the header
  would cover it -- found by the browser suite), pill with count and who.
  Tests: messageReactions.test.js 9 (participant + unsend-clear
  mutations caught), MessageReactions.test.jsx 6, day31-reactions 18.
  backend 587/587, Vitest 76/76, rehearsal 015->040 (86 indexes),
  b9, b10, day12 x2, day23, day26, day28 green.
