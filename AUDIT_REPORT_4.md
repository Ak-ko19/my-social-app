# MySocialApp — Fourth full read-only audit

**Date:** 2026-10-25 (Day 89)
**Code audited:** branch `dev` @ `9b5e055` (the Day 88 close), clean
working tree, in sync with `origin/dev`.
**Compared with:** [AUDIT_REPORT_3.md](AUDIT_REPORT_3.md) (2026-10-13,
`ca8d531`). 81 commits since (Days 60–88).

**Scope and method:**
- Read the code added since audit 3, the migrations 068–077 and the third
  report, and re-checked every audit-3 finding against its fix.
- Full verification of this exact commit (no application code changed
  during the audit):
  - backend tests: 1049 (114 files);
  - frontend unit tests (Vitest): 374 (76 files);
  - every browser suite, in small batches: all 67 regular suites, the 9
    special-stack ones, the empty/error/offline audit in EN and AR, the
    perf suite, the a11y audit and the A3 visual matrix -- all green
    (day48-activity was cut off once when the stack went down mid-batch,
    ECONNREFUSED before any check ran; alone it passes 12/12);
  - the audit-only suites: the demo world (`c1-seed`, 8/8) and the
    deployed checks (`c4-audit-checks`, 12/13 -- see B5);
  - lint, `check:i18n` (three scans), `check:headers`, `check:bundle`, the
    GO LIVE rehearsal (`--old`), `npm audit --omit=dev` in all three
    folders.
- Classified all 203 documented routes by access and rate limit with a
  script (the spec is checked against the real router, so it is the
  route list).
- Ran 28 fresh probes against a throwaway stack, aimed at what
  Days 59–88 added (two-factor login, grouped notifications, removal
  notices, memories, onboarding, the id rules, comment counts) and at
  leaks *between* features. One is a live Socket.IO probe.

No application code was changed; only this file was written. Fixes are
for the following days.

**Assumptions and limits (unchanged):**
- `.env` and the production database were not read.
- GitHub CI results can't be seen from here (private repo, no token;
  LATER.md #1).
- Real Cloudinary, email (Brevo), push (VAPID) and Turnstile need owner
  keys. They are verified with mocks, stubs and code reading.

---

## 1. Summary

**Overall health: the code is in good shape; the live site is still the
Sep 22 app.**

- Every actionable finding of audit 3 (A1–A3) is fixed, with tests. Two
  info items (N5, N6) are kept for after funding on purpose.
- Days 60–88 added two-factor login, login alerts, onboarding, a
  notifications center, memories, offline-safe screens and an admin
  dashboard and log, all with backend, component and browser tests.
- The probes found no permission hole and no data leak to other people.
- Two new findings are worth fixing, both about notifications (B1, B2).

| Measure | Audit 3 (Oct 13) | Now (Oct 25) |
| --- | --- | --- |
| Backend API tests | 868 (83 files) | **1049** (114 files) |
| Frontend unit tests | 264 (53 files) | **374** (76 files) |
| Browser suites | 57 + 6 special-stack | **67 + 9 special-stack**, plus the empty/error/offline audit (150 checks × EN/AR) |
| A3 visual matrix | 288 page checks × EN/AR | 153 page checks × 4 parts (EN/AR × light/dark) |
| a11y page checks | 117 | 62 + 62 + 7 (light, dark, Arabic) and the open-state checks — 0 serious/critical |
| Perf suite | 40 checks | **47 checks** |
| Routes (documented and checked) | 189 | **203** |
| Probes | 41/41 | **26/28** (the two failures are B1 and B2) |
| Migrations | 001–067 | 001–**077** |
| `npm audit` (production) | backend 2 (A1), frontend 0, e2e 0 | **0 / 0 / 0** |
| First download (gzip) | 220.8 kB | **216.1 kB** (budget 225 kB) |
| i18n | 1323 keys × EN/AR | **1544** keys × EN/AR, 46 plural keys with every Arabic form |

**Top risks now**

1. **Production is 307 commits behind** (`master` = `3c5d884`, Sep 22;
   database at 014). Nothing from Days 2–88 is live. This is the owner's
   GO LIVE (GO_LIVE_CHECKLIST.md, LATER.md #2); the rehearsal covers
   015 → 077 and passes today.
2. **Owner keys and secrets** (LATER #3–#8): email, the cleanup job, push,
   Turnstile, Sentry. Each one degrades gracefully, with tests. The cleanup
   secret matters most: the Privacy Policy's retention promises depend on
   it.
3. **Notifications from people you blocked (B1, new).**
4. **Notification and push spam by toggling a like or a follow (B2, new).**
5. **Single instance** (unchanged): Socket.IO presence, the rate-limit
   counters and the login throttle live in memory. New work since audit 3
   is multi-instance safe where it matters: the two-factor attempt count is
   in the database, the memories job takes an advisory lock, the ticker
   jobs use `FOR UPDATE SKIP LOCKED`. Scaling still needs Redis — after
   funding.
6. **No CI visibility from here** (unchanged).

---

## 2. Git & deployment status

| Item | Audit 3 | Now |
| --- | --- | --- |
| `dev` on GitHub | `ca8d531`, in sync | `9b5e055`, in sync |
| `dev` vs `master` | 226 ahead | **307 ahead** |
| `master` / production | `3c5d884`, Sep 22, database at 014 | Unchanged |
| Migrations waiting for production | 015 → 067 | **015 → 077** (GO_LIVE_CHECKLIST §3; rehearsal `golive-rehearsal.sh --old` passes today, 63 migrations up, down and up again) |
| Checklist counts | — | 30 tables, 34 columns, 18 indexes (checked on a fixture database) |
| New optional env vars | — | none (every Day 60–88 feature works with the existing ones) |

---

## 3. Feature verification (built since audit 3)

| Feature (Day) | Status | Evidence |
| --- | --- | --- |
| Admin overview and statistics (61–62), admin action log (63) | ✅ | API:adminOverview, adminLog; E2E:day61-overview, day63-log |
| 15 user journeys (64–66) | ✅ | E2E:journeys-core/-social/-safety, e2e/JOURNEYS.md |
| API reference for every route, responses checked (67–68) | ✅ | API:openapiSpec + every API test's contract check |
| Code health (69–71) | ✅ | one error type, one block helper, bounded lists |
| Offline + PWA (72–73) | ✅ | E2E:day72-offline, day72-install, day72-pwa |
| Performance round 2 (74) | ✅ | E2E:day27-perf (47), day74-feed-paging |
| Security round 2 (75–76) | ✅ | input sweeps, upload byte checks, socket limits, CSP reports |
| New-login alerts (77) | ✅ | API:loginAlerts; E2E:day77-login-alert |
| Two-factor with an authenticator app (77) | ✅ | API:twoFactor, twoFactorLogin; E2E:day77-two-factor (real TOTP codes); probes T1–T12 |
| First-run steps (78–79) | ✅ | API:onboarding; E2E:day78-onboarding (real photo upload) |
| Empty, error and offline states (80) | ✅ | E2E:day80-states (35 screens × 4 ways × EN/AR) |
| Notifications center: grouped, tabs, live (81–82) | ✅ | API:notificationGroups; E2E:day81-notifications; probes N2–N5 |
| "We removed your post" (82) | ✅ | API:contentRemovedNotice; probes R1–R2 |
| Memories and the morning reminder (83–84) | ✅ | API:memories, memoryNotifications; E2E:day83-memories; probes M1–M4 |
| Comment counts on cards, whole-number ids (85) | ✅ | API:commentCounts, numericIds, the id sweep; probes C1, I1–I2 |
| Owner guide (88) | ✅ | OWNER_GUIDE.md |

---

## 4. Bugs and findings

### Audit 3 findings

| # | Finding | Status | Evidence |
| --- | --- | --- | --- |
| A1 | Medium: production dependency advisories; CI didn't audit | ✅ Fixed | Day 60; CI's dependency-audit job (moderate and up). Two more advisories (body-parser, multer) appeared later and were fixed on Day 85 |
| A2 | Low: "Coming soon" Settings rows | ✅ Fixed | Day 60; only the paused features (Reels, Live) remain disabled |
| A3 | Info: two suites near a 10-minute window | ✅ Fixed | Day 66: day26-a11y and a3 run in parts |
| N5 | Info: `console.*` in the frontend | Unchanged (147 → 157) | grep; all are error paths |
| N6 | Info: login token in localStorage | Unchanged (strict CSP; no XSS found) | longer term: httpOnly cookie |

### New findings

| # | Severity | Finding | How found | Suggested fix |
| --- | --- | --- | --- | --- |
| B1 | Medium | **Someone you blocked stays in your notifications.** Blocking removes them from feeds, search, profiles and chats, but their earlier notifications stay — and since Day 81 a grouped row ("Lin, Ana and 3 others liked your post") still shows their name and face and counts them. People block to stop seeing someone. (Restricted people never notify, muted ones are only hidden from Home — those are fine.) | probe N1; `notificationController.getNotifications` has no block filter, `blockController` doesn't remove notifications | Filter blocked actors (either direction) out of the list, the grouped counts and samples, and the unread count, with `blockService.noBlockBetweenSql`. Keep the rows (unblocking brings them back), like Facebook |
| B2 | Medium | **Toggling a like or a follow re-notifies, with a push, every time.** Like → unlike → like sends a new notification and a push to the post's owner each time (also comment likes, reactions, follow/unfollow). Within the global limit that is about 150 pushes in 15 minutes to one person — harassment by notification. Grouping hides the rows, not the pushes | code reading (`likeController`, `followController` call `notify` on every insert); probe B2 | In `notificationService.notify`, skip a like/comment_like/follow notification when the same actor already notified the same person about the same thing in the last day (Facebook doesn't notify twice). One query, with the existing (user_id, type, created_at) index; tests for each type |
| B3 | Info | A two-factor login challenge can be used for more than one login within its 5 minutes, each with a fresh code | code reading (`twoFactorService.readChallenge`: signed, 5 minutes, a password fingerprint; no use-once mark) | Acceptable (each login still needs a new code). Optional: mark the challenge used (a jti) |
| B4 | Info | 180 of the 202 router routes rely on the global limit only (300 requests / 15 minutes per user); writes with a limiter of their own: 20 of 128. Message sends (`messageService`) and new posts and comments (the Day 49 spam checks) are limited inside the services | route script (each router call's middleware) | Fine at this size; B2 is the one case where it matters. Revisit with Redis |
| B5 | Info | `e2e/c4-audit-checks.cjs` fails its route check: its list of intended public routes dates from the first audit, so 12 routes added since (health, config, docs, share cards, `/login/2fa`, `/form-token`, `/csp-reports`, `/push/config`, `/internal/cleanup`) count as "unexpected". Each one was checked: `/internal/cleanup` needs `CLEANUP_SECRET`, share cards show only what `getVisiblePost(id, null)` or a public account allows, and the rest hold nothing private | the `--audit` run | Bring the list up to date (or derive it from the spec's public operations) so the check means something again. It isn't in CI, so it went unseen |

---

## 5. Security, performance and code quality

- **Access (203 routes):** 18 public, 22 optional login, 151 login only,
  11 admin only (404 to anyone else), 1 machine secret. The auth sweep
  (every login-only route refuses no, forged and logged-out tokens) and the
  input sweeps (wrong JSON types, repeated query keys, and since Day 85
  malformed path ids on every route) pass.
- **Two-factor:** keys never leave the server after set-up; codes are
  single-use per 30-second step even under racing requests; wrong codes
  are counted in the database (so every instance shares the count);
  challenges are signed with a key of their own and end on a password
  change. The keys are stored unencrypted — encrypting them needs a key the
  owner sets (after funding).
- **Privacy Policy** matches what the code keeps: login devices (180
  days), the time zone, removal notices' excerpts (90 days), two-factor
  keys and hashed recovery codes while 2FA is on (dated 2026-10-25).
- **Performance:** the perf suite (≈1M rows) passes all 47 checks; new
  lists have indexes (075 notifications by type, 077 posts by month and
  day); grouped notifications read at most the newest 1,000 rows per page.
- **Dependencies:** `npm audit --omit=dev` is clean in all three folders.
  New advisories appeared between audits (body-parser, multer); CI's
  audit job catches them on the next push.
- **Code health:** no TODO/FIXME; the largest file is
  `messageService.js` (673 lines); lint clean; every route documented.
- **Accessibility:** 0 serious or critical axe findings on 62 pages in
  light and dark and 7 in Arabic; the verify-email banner's contrast was
  fixed on Day 86 and is checked.

---

## 6. Gap analysis

### Audit 3's "still to build" — where it stands

| Item | Status |
| --- | --- |
| Admin audit log (63) | ✅ Built |
| 2FA (77), onboarding (78–79), empty and error states (80) | ✅ Built |
| Notifications center (81–82), memories (83–84) | ✅ Built |
| Help & support, About | ✅ Built (Day 60) |

### Still missing (for the next 30 Days)

- **Notifications:** B1 and B2 above; notification settings per group or
  page (mute one group's posts).
- **Posts:** sharing a post into your own feed (re-share with a comment),
  editing a post's photos, alt text you write yourself for photos.
- **Chat:** search inside a conversation, pinned chats, archived chats.
- **Profiles:** a "verified" request flow for pages, profile
  completeness hints.
- **Safety:** report reasons with free text for "other", a limit on
  new-account actions in the first hour (spam).
- **Admin:** bulk actions on reports, a content search for admins.
- **Paused (unchanged):** short and long videos, live streaming, calls.

---

## 7. Recommended order of work

1. **GO LIVE (owner):** GO_LIVE_CHECKLIST.md with migrations 015 → 077,
   then LATER #3 (email) and #4 (cleanup).
2. **B2** (notification spam) and **B1** (blocked people in
   notifications) — a day.
3. The next 30 Days (rule 12), owner-free and on free tiers, starting with
   the gaps above.
