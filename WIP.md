# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 24–25 — Next P1 features from the gap list
**Step:** — (steps 1–3 done; close pending)

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
Days 24–25 picks (AUDIT_REPORT P1, free tier, not done and not
scheduled on a later Day; already done: sessions, push, error log,
Turnstile, comment/message reports, cleanup, link previews, post share
cards, headers, CI; scheduled later: a11y Day 26, data export Day 28,
content filter Day ~47, 2FA Day 77):
1. Report groups and pages (completes audit #9).
2. Share cards for pages and profiles (completes the SEO/share item).
3. Self-host the fonts (privacy: no Google Fonts request per visitor;
   CSP gets simpler; suites stop failing when the internet drops).

Step 1 plan — report groups and pages:
- Migration 038: report_target_type += 'community', 'page'.
- POST /reports: community (exists; private ones only by members — others
  get the same 404 as a missing group; not your own group), page (exists;
  not your own). Snapshot = name + description; owner = created_by /
  owner_id.
- Admin: list shows the group/page (name, link, owner); Remove deletes it
  (posts go with it) after a confirm; ban/suspend the owner as usual.
- UI: "Report group" / "Report page" in their screens' menus for
  non-owners (ReportDialog). EN/MY/AR.
- Tests + browser suite.

## Progress
- Step 1 built: migration 038, report rules, admin card + confirm remove,
  Report buttons, EN/MY/AR. Verified so far: reportGroupsPages 5 +
  reportTargets 13, 2 mutations caught, day24-report-places 16/16,
  b12/b13/b14/day12 green; backend 564/564; rehearsal 015→038; 038 down
  with data OK, up idempotent. Step 1 DONE.
- Step 2 DONE: share cards for profiles (public, active only; by id or
  username) and pages (hidden with a deactivated owner); vercel.json
  rewrites; backend 567/567 (share 13, 2 mutations caught); day19-share
  18/18 on the dist build.
- Step 3 DONE: fonts self-hosted (@fontsource; unicode-range subsets),
  CSP style-src/font-src now self only, fonts never inlined (vite
  assetsInlineLimit), check-headers guards both; day19-share proves fonts
  load from this site with no Google request; b15/b16/c3/a2/day10 + A3
  EN/MY/AR green.
- Next: Days 24–25 close (full browser run).
