# WIP — current work (see MONTH_PLAN.md for the full plan)

**Day:** 12 — Moderation
**Step:** 1 — Report comments and messages.

## Step 1 plan
- Migration 031_report_comments_messages: report_target_type += 'comment',
  'message'; reports.target_owner_id (author of the reported thing, ON
  DELETE SET NULL) + reports.target_snapshot (the reported text at report
  time, max 1000 chars, so the evidence survives an edit/unsend). Down:
  deletes comment/message reports, drops the columns, rebuilds the enum.
  Fixture + GO_LIVE loop + rehearsal.
- POST /reports: targetType comment → comment must exist, not your own.
  message → must exist, not deleted, reporter must be a participant of
  its conversation (else 404 — never reveal other chats), not your own.
  Voice/photo messages: snapshot = caption or null (type shown instead).
- Admin list: comment → live text/author/post id; message → live
  text/type/sender (only the reported message, never the rest of the
  chat); target_exists; falls back to the snapshot when gone.
  Ban resolves pending comment/message reports on that user too.
- Frontend: "Report" on others' comments (comment actions) and a flag
  button on others' messages (bubble actions) → the existing
  ReportDialog; admin panel renders the new target kinds. EN/MY/AR.
- Tests: jest (rules, privacy 404, snapshot, admin list, ban resolves,
  enum/columns); browser suite day12-report (comment + DM + group, RTL).

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
- Day 13 (Vitest): add a unit test for frontend `utils/safeUrl.js`, and
  consider one for `hooks/useFormGuard.jsx` (wait + stale-token retry).
- Tip: `E2E_FRONTEND=dist bash run-all.sh` runs the browser suites on the
  production build with vercel.json's real headers.
- GO_LIVE_CHECKLIST edits: use the Edit tool, never a node/heredoc
  script — `\n` inside a quoted heredoc lands as a literal "\n" (bit
  twice, Days 10 and 12; the rehearsal catches it).
- Playwright gotcha seen 4× now: getByRole/getByLabel/getByText name
  matching is a SUBSTRING match — use `exact: true` when one label is
  contained in another.

## Plan
Step 2 — admin report review: remove comment/message, suspend user.
(B12 already has: admin role, list pending/reviewed, dismiss, remove post,
ban/unban.)
- Migration 032_add_suspensions: users.banned_until (NULL = permanent
  ban; a time = suspended until then); reports resolution += 
  'user_suspended'. Down: suspensions become permanent bans (the old
  code can't expire them; safer than silently unbanning), resolution
  'user_suspended' → 'user_banned'.
- services/moderationService.js: liftExpiredSuspension(userId) (clears
  the ban + reactivates, like unban), liftExpiredSuspensions() for the
  Day 9 cleanup job. authorize(): an expired suspension is lifted on the
  spot → 'ok'; an active one → 'suspended' (401 "This account is
  suspended"). Login: active → 403 {message:"This account is
  suspended", until}; expired → lifted, logs in normally.
- POST /admin/users/:id/suspend { days: 1|3|7|30, reason } — same effects
  as ban (hide content, disconnect sockets, resolve reports) with
  resolution 'user_suspended'. Unban also lifts a suspension.
- POST /admin/reports/:id/remove-content: comment → deleted (replies +
  likes cascade); message → soft-deleted like an unsend (media removed
  from Cloudinary, 'message_deleted' emitted to the chat), resolution
  content_removed for all pending reports on it.
- Frontend admin card: "Remove comment" / "Remove message", "Suspend…"
  with a 1/3/7/30-day choice + reason, "Suspended until …" tag, "Lift
  suspension"; Login shows "suspended until <date>". EN/MY/AR.
- Tests: jest (suspend/expiry/lift paths, remove comment/message, socket
  emit), cleanup job lifts; browser: day12-review.

## Progress
- Step 1 DONE (2026-09-30): built as planned. Extras/decisions:
  - Post reports also store owner + snapshot now (evidence survives an
    edit; ban resolves via target_owner_id).
  - services/rateLimiter.js got resetMessageRateLimits() for tests (its
    in-memory counters outlive a DB reset and ids restart).
  - Admin: voice → inline player, photo → thumbnail, only the reported
    message; "As reported:" text in <bdi> (bidi with Arabic labels).
  - Verified: backend 434/434; 6 mutation checks caught; 031 down with
    comment/message reports present + up twice OK; golive-rehearsal
    --old PASSED (015→031); day12-report 37/37 EN/MY/AR; b12/b4/b9/b10
    + a3 ar green.
- Step 2 DONE (2026-09-30): built as planned. Verified: backend 445/445;
  10 mutation checks caught; golive-rehearsal --old PASSED (015→032);
  032 down (suspension → permanent ban) / up twice OK; day12-review
  15/15 (live message removal in bob's open chat, MY login "suspended
  until", AR form), day12-report, b12-admin, day8-sessions, b9-dm, a3 en
  green. Added formatDate(…, 'longTime') (no seconds). Checklist has a
  Day 12 smoke item.
  - Lesson: never run mutation checks while a browser stack is starting —
    a backend booted mid-mutation crashed two suites (rerun clean: green).
- Next: Day 12 close — full browser run, Progress Log, reset WIP.
