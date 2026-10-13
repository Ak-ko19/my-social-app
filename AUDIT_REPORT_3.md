# MySocialApp — Third full read-only audit

**Date:** 2026-10-13 (Day 59)
**Code audited:** branch `dev` @ `ca8d531` (the Day 58 close), clean
working tree, in sync with `origin/dev`.
**Compared with:** [AUDIT_REPORT_2.md](AUDIT_REPORT_2.md) (2026-10-05,
`61969ae`).

**Scope and method:**
- Read the code, the migrations and the second report.
- Re-checked every second-audit finding (N1–N6) against its fix.
- Used the full verification of this exact commit (the Day 58 close,
  the same day; no application code has changed since):
  - backend tests: 868 (83 files);
  - frontend unit tests (Vitest): 264 (53 files);
  - all 57 regular browser suites plus the 6 special-stack ones;
  - the A3 visual matrix (288 page checks × EN/AR);
  - the a11y audit (117 page checks) and the perf suite (40 checks);
  - `check:i18n` (now also the hardcoded-text and right-to-left CSS
    scans), `check:bundle`.
- Classified all 189 HTTP routes by their middleware with a script.
- Ran 41 fresh probes against a throwaway stack, aimed at what Days 30–58
  added and at leaks *between* features. 4 of them are live Socket.io
  probes.
- Ran `npm audit --omit=dev` on backend, frontend and e2e.

No application code was changed; only this file was written. Fixes are
for the following days.

**Assumptions and limits (unchanged):**
- `.env` and the production database were not read.
- GitHub CI results can't be seen from here (private repo, no token;
  LATER.md #1).
- Real Cloudinary, email (Brevo), push (VAPID) and Turnstile need owner
  keys. They're verified with mocks, stubs and code reading.

---

## 1. Summary

**Overall health: the code is in good shape; the live site is still the
Sep 22 app.**

- All of audit 2's actionable findings (N1–N4) are fixed, with tests.
- No probe found a leak or a permission hole.
- There are two new findings worth fixing. Neither is exploitable as the
  app is configured today:
  - a dependency advisory (A1);
  - leftover "Coming soon" rows (A2).

| Measure | Audit 2 (Oct 5) | Now (Oct 13) |
| --- | --- | --- |
| Backend API tests | 578 (52 files) | **868** (83 files) |
| Frontend unit tests | 65 (11 files) | **264** (53 files) |
| Browser suites | 38, + A3 228 × 3 languages | **57 + 6 special-stack**, + A3 288 × 2 languages (EN/AR since Oct 7) |
| a11y page checks | 88 | **117**, plus open dialogs and sheets (day58-open-states, 50 checks) |
| Perf suite | 30 endpoints | **40 checks** |
| Routes | 121 | **189** |
| Probes | 32/32 | **41/41** |
| Migrations | 001–039 | 001–**067** |
| `npm audit` (production) | 0 / 0 / 0 | backend **2** (A1), frontend 0, e2e 0 |
| First download (gzip) | 213.8 kB | 220.8 kB (budget 225 kB) |
| i18n | 884 keys × EN/MY/AR | 1323 keys × EN/AR; CI now also fails on hardcoded UI text and on physical left/right CSS |

**Top risks now**

1. **Production is 226 commits behind** (`master` = `3c5d884`, Sep 22;
   database at 014).
   - Nothing from Days 2–58 is live, including audit 1's Critical
     rate-limit fix.
   - This is the owner's GO LIVE (GO_LIVE_CHECKLIST.md, LATER.md #2). The
     rehearsal covers 015 → 067.
2. **Owner keys and secrets** (LATER #3–#8): email, the cleanup job, push,
   Turnstile and Sentry. Each one degrades gracefully, with tests.
   - The cleanup secret matters most: the Privacy Policy's retention
     promises depend on it.
   - Zawgyi conversion of old production text (#8) runs at GO LIVE.
3. **A dependency advisory in the backend (A1, new).**
4. **Single instance.** Socket.io rooms and presence, and the
   express-rate-limit counters, live in memory.
   - New since audit 2: the in-process ticker (scheduled posts, ended
     polls, event reminders) is safe across instances (`FOR UPDATE SKIP
     LOCKED`).
   - It catches up on anything overdue after the free host sleeps; the
     keepalive workflow pings it every 10 minutes.
   - Scaling still needs Redis (paid) — after funding.
5. **No CI visibility from here** (unchanged).

---

## 2. Git & deployment status

| Item | Audit 2 | Now |
| --- | --- | --- |
| `dev` on GitHub | `61969ae`, in sync | `ca8d531`, in sync |
| `dev` vs `master` | 144 ahead | **226 ahead** |
| `master` / production | `3c5d884`, Sep 22, database at 014 | Unchanged |
| Migrations waiting for production | 015 → 039 | **015 → 067** (GO_LIVE_CHECKLIST §3; rehearsal `golive-rehearsal.sh --old` passes — last run Day 57, no migrations since) |
| New optional env vars | — | `UPLOAD_LIMIT_FILES_PER_DAY`, `UPLOAD_LIMIT_MB_PER_DAY`, `NEON_STORAGE_LIMIT_MB` (all have safe defaults) |

---

## 3. Feature verification (built since audit 2)

**Evidence abbreviations:**
- `API:x` — `backend/tests/api/x.test.js`;
- `E2E:x` — `e2e/x.cjs`;
- `P` — today's probe.

| Feature (Day) | Status | Evidence |
| --- | --- | --- |
| Route guard (30) | ✅ | `RequireAuth` on every account-only screen, including every route added since; E2E:day30-guard |
| Message reactions, forward (31–32) | ✅ | API:messageReactions, messageForward; E2E:day31-reactions, day32-forward; P: no forwarding or reacting from a chat you're not in |
| Group chat admins, photo (33–34) | ✅ | API:groupAdmins, groupPhoto; P: a removed member's open socket hears nothing more and can't send |
| Profile: cover, pinned post, tabs, links (36) | ✅ | API:coverPhoto, pinnedPost, profileTabs, profileLinks; P: a pinned only-me post shows nowhere for others; you can't pin someone else's post |
| Friends, mutual friends, suggestions (37–39) | ✅ | API:friends, suggestions; E2E:day37-friends, day39-pymk; P: a blocker's mutual friends are 404 |
| Explore, hashtag top, trending cache (40–41) | ✅ | API:explore, hashtagTop, trendingCache |
| Search ranking, history, Zawgyi (42–43) | ✅ | API:searchRanking, searchHistory, myanmarText; P: you can't delete someone else's history |
| Polls (44) | ✅ | API:polls, pollEnd; P: no voting on a poll you can't see |
| Drafts, scheduled posts (45) | ✅ | API:drafts, scheduledPosts; drafts live in their own table until published, so nothing scheduled can surface early |
| Saved collections (46) | ✅ | API:collections; P: a saved post that later becomes only-me disappears from the collection, bookmarks, activity and the data download |
| Privacy: close friends, restrict, interactions, mute, hidden words (47, 49) | ✅ | API:closeFriends, restrict, interactions, hiddenWords; P: a close-friends post surfaces nowhere for others (feed, search, hashtag, explore, profile, share card, logged out); restricted comments are hidden from others and can't be self-approved; comment and message permissions hold, replies included |
| Activity log (48) | ✅ | API:activity; E2E:day48-activity |
| Spam checks (49) | ✅ | API:spam; E2E:day49-spam |
| Group bans, delete, paging (50) | ✅ | API:communityModeration; P: a banned member loses the posts everywhere, can't rejoin or comment |
| Pages: admins (53) | ✅ | API:pageAdmins; P: no adding someone who blocked you; others can't edit your page |
| Events (55) | ✅ | API:events; P: a blocker's event is 404 and can't be answered; others can't edit or cancel |
| Storage safety: compression, upload limit, Admin > Storage (57) | ✅ | API:uploadQuota, storage; E2E:day57-storage; P: Admin > Storage is 401 logged out, 404 for non-admins |
| Translations and RTL enforced, open-state a11y (58) | ✅ | `check:i18n` (3 scans); E2E:day58-open-states |

**Placeholders still visible:**
- **Settings:** 9 rows are still disabled "Coming soon" — the same 9 as
  audit 2. 2 are paused features (Reels/videos, Live streaming). The
  other 7 are finding A2.
- **Elsewhere:** the Settings search button; the composer's Video and
  Live buttons and the Videos and Shorts tabs (paused features).
- The Menu screen has none.

---

## 4. Bugs and findings

### Audit 2 findings

| # | Was | Status | Evidence |
| --- | --- | --- | --- |
| N1 | Medium: no route-level auth guard | ✅ Fixed | `RequireAuth` (Day 30); E2E:day30-guard covers 33 guarded and 14 public routes |
| N2 | Low: one unrepeated backend test failure | ✅ Fixed | `2ead62a` |
| N3 | Low: Explore aggregated 7 days per request | ✅ Fixed | trending cache `8e157b4`; API:trendingCache |
| N4 | Low: dead code | ✅ Fixed | `PostContent.jsx` and `src/assets` are gone |
| N5 | Info: `console.*` in the frontend | Unchanged (117 → 147) | grep |
| N6 | Info: login token in localStorage | Unchanged (strict CSP; no XSS found) | longer term: httpOnly cookie |

### New findings

| # | Severity | Finding | Evidence | Suggested fix |
| --- | --- | --- | --- | --- |
| A1 | Medium | `npm audit --omit=dev` reports 2 advisories in backend production dependencies: **proxy-addr 2.0.7** (critical, GHSA-jqcg-44mw-7w3h — IP spoofing through an IPv4-mapped IPv6 *trust subnet*; comes with express 5.2.1) and **source-map-js 1.2.1** (high, GHSA-68fv-2mgg-jv7q — slow parsing of crafted source maps; comes with sanitize-html → postcss). Neither is reachable as configured: `trust proxy` is a hop count (`config/trustProxy.js`), never a subnet, and no user input reaches a source-map parser. CI doesn't run `npm audit`, so a new advisory would go unnoticed | `npm audit --omit=dev`; `npm ls proxy-addr source-map-js` | `npm audit fix` in backend (lockfile only, same major versions), then the full backend run. Add `npm audit --omit=dev --audit-level=high` for backend, frontend and e2e to CI |
| A2 | Low | 7 Settings rows are still disabled "Coming soon" although the app now has screens for some of them: Who can see my content, Followers & following, Content preferences, News feed settings, Story settings, Help & support, About. A dead row looks unfinished in an investor demo | `SettingsScreen.jsx` rows without `to` | Point *Followers & following* at the connections screen and *Who can see my content* at the privacy and audience controls. Build *About* (version, Terms, Privacy) and *Help & support* (a short translated FAQ). Remove or merge rows that have no planned feature. EN/AR, RTL, a browser check |
| A3 | Info | `day26-a11y` and `a3-visual` need most of a 10-minute window each, and the full run is long on the owner's machine (one run was stopped for low memory). Owner rule since Oct 13: small batches, stack down between batches | MONTH_PLAN Work rhythm | Day 64–66 (end-to-end tests): split the two longest suites so each part runs in a few minutes |

---

## 5. Security, performance and code quality

**Security**

- ✅ **Route coverage:** a script read all 189 routes.
  - 142 need a login and 9 are admin-only (login + `requireAdmin`, 404 to
    non-admins).
  - 24 are optional-auth reads that go through the visibility rules, and
    1 is secret-protected (`/internal/cleanup`).
  - 13 are intentionally public — **the same 13 as audit 2**. Nothing new
    is open.
- ✅ **Fresh probes, 41/41:**
  - **Visibility across features:** a close-friends post, a pinned
    only-me post, and a saved-then-hidden post never surface for the
    wrong person. Checked in the feed, `/posts`, search, the hashtag
    page, explore, profile, user posts, bookmarks, collections, activity,
    notifications, share cards, the data download, and logged out.
  - **Blocks against new features:** events, page admins, close friends,
    mutual friends.
  - **Group bans:** the post, the post list, search and everywhere else;
    no rejoining or commenting.
  - **Permissions:** comment permission (including replies), message
    permission, restrict (hidden from others, no self-approval), polls,
    and owner-only edits (events, pages, pins, search history).
  - **Messages:** no forwarding or reacting from a chat you're not in,
    including a forged chat id.
  - **Socket.io:** a removed member's open socket gets nothing more and
    can't send; a third person hears nothing from a chat they're not in.
- ⚠️ **Dependencies:** A1.
- ✅ **Unchanged:** parameterised SQL; uploads allowlisted and capped (now
  also per person per day); hashed single-use tokens; no secrets in the
  repo; test-only stubs honoured only outside production; 0 `console.*`
  in backend sources.
- ⛔ **Still missing (planned):** 2FA (Day 77); an admin audit log
  (Day 63).

**Performance**

- ✅ The perf suite (40 checks at about 1M seeded rows) passes, with
  trending precomputed (N3).
- ✅ Photos are compressed in the browser before upload (≤ 2048 px, WebP
  or JPEG).
- ✅ The first download is 220.8 kB gzipped, within the 225 kB CI budget.
  Only 4.2 kB of headroom is left, so the next large screen should load on
  demand.

**Free-tier fit**

- **Neon 0.5 GB:** Admin > Storage now shows the database against the
  plan, with warnings at 80 % and 95 %.
- **Cloudinary:** the per-person upload limit (100 files / 300 MB a day)
  and compression keep credits in check.
- **Render 512 MB:** one process. The ticker and Socket.io are small.
- No paid service is required.

**Code quality**

- ✅ No TODO, FIXME or HACK markers.
- ✅ Routes → controllers → services is consistent. New features have
  their own services (collection, draft, poll, restrict, pageAdmin,
  uploadQuota, storage…).
- **Largest files:**
  - backend: `messageService.js` 674 lines, `conversationController.js`
    572, `communityController.js` 486;
  - frontend: `CreatePost.jsx` 463, `Conversation.jsx` 457,
    `AdminScreen.jsx` 423.
  - These are worth splitting during Day 69–71 (code health), not
    urgent.

**Tests**

| Suite | Count | Result | In CI? |
| --- | --- | --- | --- |
| Backend API (Jest + Supertest, real PostgreSQL) | 83 files, 868 tests | ✅ | Yes |
| Frontend unit (Vitest) | 53 files, 264 tests | ✅ | Yes |
| Browser suites (headless Edge) | 57 regular + 6 special-stack | ✅ | Smoke on push, full on PRs to `master` |
| A3 visual matrix | 288 page checks × EN/AR | 0 failures ✅ | In the full run |
| a11y | 117 page checks + open states (50) | 0 serious ✅ | In the full run |
| Go-live rehearsal | 015 → 067 | PASSED ✅ (Day 57) | By hand before GO LIVE |
| `check:i18n` (keys, hardcoded text, RTL CSS), `check:headers`, `check:bundle` | 1323 keys × 2 | ✅ | Yes |
| `npm audit --omit=dev` | 3 packages | ⚠️ A1 | **No** (A1) |

---

## 6. Gap analysis

### Audit 2's "still to build" — where it stands

| Item | Status |
| --- | --- |
| Messaging: reactions, forward (31–32) | ✅ Done (pinned messages were not in the Day 31–32 plan and are not built) |
| Profile upgrade, friends, better search, privacy controls, activity log (36–48) | ✅ Done |
| Polls, drafts and scheduled posts, saved collections (44–46) | ✅ Done |
| Content filtering (49) | ✅ Done: hidden words + spam checks |
| Events (55–56) | ✅ Done (basic) |
| Admin audit log (63) | ⛔ Planned |
| 2FA (77), onboarding (78–79), empty and error states (80) | ⛔ Planned |
| Help & support, About | ⛔ Not on a numbered Day — now A2 |

### Paused (unchanged)

Short and long video, calls, random video chat, live streaming. These are
shown as disabled tabs, buttons and rows.

---

## 7. Recommended order of work

1. **Day 60 (owner-free part; GO LIVE itself is the owner's):**
   - fix A1: `npm audit fix` in backend, plus an `npm audit` step in CI;
   - fix A2: wire up or build the 7 Settings rows, EN/AR + RTL, with a
     browser check;
   - then the full verification.
2. **Owner, whenever possible** (each step is in LATER.md):
   - GO LIVE (#2), with Zawgyi conversion (#8);
   - confirm CI on GitHub (#1);
   - Brevo (#3), the cleanup secret (#4), VAPID (#7); optional: Turnstile
     (#6), Sentry (#5);
   - before the public launch: a legal review of `/terms` and `/privacy`
     and a native-speaker review of the Arabic.
3. **Phase 3 (Days 61+) as planned.**
   - Fold A3 (splitting the long suites) into Days 64–66.
   - Fold the large-file splits into Days 69–71.
4. **After funding:** Redis for sockets and rate limits (multiple
   instances), and an httpOnly-cookie session (N6).
