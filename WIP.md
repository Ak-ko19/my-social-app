# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 16 — Myanmar
**Step:** 1 — MY translations + font + switcher (exist since B15: verify)
and the missing part: save the language choice PER USER.

## Step 1 plan
- Exists: my.json (838 keys, check:i18n), Noto Sans Myanmar (unicode-range,
  only loads for Burmese text), Settings → Language + landing select.
- Missing: the choice lives only in this browser (localStorage).
- Migration 033_add_user_language: users.language varchar(5) NULL,
  CHECK in ('en','my','ar'). NULL = never chosen.
- API: PUT /profile/language {language} (auth, validated); GET
  /profile/me and POST /login return `language`; POST /signup takes an
  optional language (invalid/missing → NULL, never fails a signup).
- Frontend: Language screen saves to the account when logged in
  (best effort; on failure a quiet note, still applied here). Login: the
  account's language wins on a new device; if the account has none, the
  device's current language is saved to it. Signup sends the current
  language.
- Copy: language hint ("on all your devices"), privacy text (language is
  also saved to the account) in EN/MY/AR.
- Tests: backend (validation, me/login/signup), vitest (Language screen
  save + failure note, Login applies account language), browser suite
  day16-language (choose MY on one device → new device logs in in MY;
  RTL for AR).

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

## Plan
(written at the start of each step)

## Progress
- Step 1 DONE (2026-10-01). Verified: backend 459/459 (language.test 5;
  5 mutations caught after making the isolation test start at user 2);
  vitest 37/37; rehearsal 015→033 PASSED; day16-language 15/15;
  a2/b11/b15/b16/c2/day11-bots green; c3-landing + day16-language
  stalled once (dev server, ~1.6 GB free RAM) and passed on rerun.
- Day 16 close run #1: day8-sessions-list showed a REAL design flaw —
  the first login auto-saved the device default (en) to the account,
  which then overrode an Arabic device. Fixed (utils/languageChoice.js):
  only picked languages reach the account; a logged-out pick is pending
  and wins at the next login there; signup sends only a picked one.
  day16-language 17/17, day8-sessions-list green, vitest 38/38.
- Next: Day 16 close run #2 (all batches again).
