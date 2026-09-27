# MySocialApp — Final end-to-end audit (C4)

**Date:** 2026-09-27
**Code audited:** branch `dev` at commit `e0949a2` (clean working tree).
**Where:** the local stack, not the deployed site:
- backend and frontend dev servers;
- a throwaway PostgreSQL 17 database (the same schema as migrations
  001–027), loaded fresh for every test suite;
- headless Microsoft Edge driving the real UI.

Every browser suite used here is in the repo under `e2e/`. To rerun this
whole pass: `cd e2e && npm install && npm run test:audit` (see
`e2e/README.md`).

**Result: all 28 roadmap items re-verified in one pass.**

| Result | Items |
| --- | --- |
| ✅ Pass | 24 |
| ⏳ Blocked on the owner | 3: Phase 2 real email, A4 first GitHub CI run, A5 keep-alive schedule |
| — | C4 (this audit) |

No feature failed. One problem was found and fixed during the audit (see
"Findings").

> **Before an investor demo on the live site:** the deployed backend
> (`my-social-app-ecjg.onrender.com`) still runs old code. None of
> B1–B16 or C1–C3 is live until the owner:
> 1. runs migrations 015 → 027 on the production database;
> 2. deploys `dev`;
> 3. merges into `master`.
>
> Full steps are under "Owner actions" below. For a demo today, run the
> app locally with the demo data (`cd backend && npm run seed:demo`, then
> log in as `thiri@demo.mysocialapp.test` / `demo-password-123`).

---

## Totals from this pass

| Check | Result |
| --- | --- |
| Backend API tests (Jest + Supertest) | **233 / 233** passed, 26 suites |
| Frontend lint + i18n check + production build (the CI steps) | pass |
| Feature browser suites (19 suites) | **281 / 281** checks passed |
| Visual matrix A3: every route × 375/390/430 px × light/dark | **222 / 222** English, **222 / 222** Myanmar, **222 / 222** Arabic |
| Pixel comparison of English + Myanmar against the pre-B16 screenshots | identical except intended changes (details under B16) |
| Audit-only checks (Phase 1, A5, A6) | **13 / 13** passed |
| Demo seed browser check (C1) | **8 / 8** passed |

---

## Per-item results

| # | Item | Result | Evidence from this pass |
| --- | --- | --- | --- |
| Phase 1 | Demo-breaking bug fixes | ✅ Pass | Audit checks 7/7 (see below) |
| Phase 2 | Real email delivery | ⏳ Owner | See below |
| A1 | Automated API tests | ✅ Pass | 233/233, 26 suites |
| A2 | Reliability | ✅ Pass | Walkthrough 22/22 |
| A3 | Visual consistency | ✅ Pass | 222/222 in each language |
| A4 | GitHub Actions CI | ⏳ Owner | See below |
| A5 | Keep-alive cron | ⏳ Owner | See below |
| A6 | Security & performance | ✅ Pass | Audit checks 5/5, plus one fix (see below) |
| B1 | Reactions | ✅ Pass | `b1-reactions` 14/14 |
| B2 | Multiple images per post | ✅ Pass | `b2-media` 14/14 |
| B3 | Stories (24h expiry) | ✅ Pass | `b3-stories` 16/16 |
| B4 | Comment replies + comment likes | ✅ Pass | `b4-comments` 15/15 |
| B5 | Post audience (Public / Followers) | ✅ Pass | `b5-audience` 14/14 |
| B6 | Profile tabs | ✅ Pass | `b6-tabs` 13/13 |
| B7 | Explore | ✅ Pass | `b7-explore` 7/7 |
| B8 | People you may know | ✅ Pass | `b8-pymk` 10/10 |
| B9 | DM extras | ✅ Pass | `b9-dm` 15/15 |
| B10 | Group chat | ✅ Pass | `b10-groups` 14/14 |
| B11 | Notification settings | ✅ Pass | `b11-settings` 9/9 |
| B12 | Admin moderation | ✅ Pass | `b12-admin` 13/13 |
| B13 | Groups (communities) | ✅ Pass | `b13-groups` 22/22 |
| B14 | Pages | ✅ Pass | `b14-pages` 20/20 |
| B15 | Myanmar / English | ✅ Pass | `b15-lang` 12/12; `check:i18n` passes |
| B16 | Arabic (RTL) | ✅ Pass | `b16-rtl` 16/16; Arabic A3 222/222 |
| C1 | Demo seed script | ✅ Pass | Seed ran; `c1-seed` 8/8 |
| C2 | Terms + Privacy (draft) | ✅ Pass | `c2-legal` 8/8 |
| C3 | Landing page | ✅ Pass | `c3-landing` 27/27 |
| C4 | Final audit | ✅ This report | — |

**What each suite covers:**

- **A1:** includes the demo-seed safety guard (it refuses to run against
  a remote database).
- **A2:** signup → login → feed → post → react → comment → follow → DM →
  edit profile → logout, in a real browser.
- **A3:**
  - Checks: no horizontal scroll, nothing clipped or overflowing on
    either edge, no text clipped vertically, no light surfaces in dark
    mode, no console errors, and the correct `<html lang/dir>`.
  - 37 routes: public pages, landing, legal, all app screens, and the
    group/page/admin screens.
- **B1:** choosing and changing a reaction, counts, and keyboard access.
- **B2:** 1–10 images, swipe and keyboard navigation, and the image
  counter.
- **B3:** post, view, seen state, delete.
- **B4:** threaded replies, reply-to, and comment likes.
- **B5:** followers-only posts are hidden from non-followers, and the
  audience can be changed.
- **B6:** Posts/Photos/Saved/Tagged, private account, and keyboard tabs.
- **B7:** trending hashtags and popular posts.
- **B8:** suggestions with reasons, and following from a card.
- **B9:** edit/delete messages, reply-to, and photo messages (including
  failure and retry).
- **B10:** create a group, add/remove members, rename, leave, and live
  updates.
- **B11:** the switches persist and stop the chosen notification types.
- **B12:** report queue, remove post, ban (the open session is logged
  out), unban.
- **B13:**
  - Create a private group, post inside it, and confirm group posts stay
    out of the home feed.
  - Request/approve, admin delete, promote, go public, leave, and search.
- **B14:** create a page, post as the page, follow it, see its posts in
  the Home feed, edit it, and delete it with typed confirmation.
- **B15:**
  - Switching and persistence, `html lang`, the Myanmar font, and a
    Burmese server error.
  - Burmese relative times.
- **B16:**
  - `dir=rtl` and `lang=ar`, a mirrored tab bar, back arrow and chat
    bubbles, and RTL arrow keys.
  - An English post stays LTR, and hashtags and handles are isolated.
  - Arabic dates, font and server errors, and switching back to LTR.
- **C1:**
  - Feed, page posts, reactions, 3 unread notifications, an unread DM,
    groups, the hashtag feed, and the admin report.
- **C2:** both pages are public, linked from Signup and Settings, and
  exist in all languages, with Burmese dates.
- **C3:**
  - Logged-out `/` lands on `/welcome`; the CTAs and the language switch
    work; logged-in visitors get "Open the app".
  - No horizontal scroll at 375/768/1280 px × light/dark × en/my/ar.

### Phase 1 — audit checks (7/7)

- Search is reachable from the top bar.
- The notification badge equals the real unread count ("3 unread",
  matching the API).
- The Menu shows the real logged-in user.
- The stories tray only shows real accounts, and the mock-data files and
  imports are gone.
- `/uploads` is no longer served: there is no static route in
  `server.js`, and `GET /uploads/...` returns 404.

### A6 — audit checks (5/5) plus one fix

- **Routes:** all 99 API routes were classified: 70 need a login, 5 are
  admin-only (login plus `requireAdmin`), 18 are optional-auth reads
  that go through the visibility rules, and 6 are intentionally public
  (signup, login, forgot/reset password, email verification, follow
  counts). None was unexpected.
- **Speed (local, demo data, median of 5):** `/feed` 7 ms,
  `/notifications` 14 ms, `/conversations` 16 ms, `/explore/posts`
  19 ms, `/search/posts` 16 ms, `/communities` 16 ms, `/pages` 17 ms,
  comments 18 ms. All 11 endpoints were under 20 ms.
- **Dependencies:** `npm audit` of production dependencies found 0
  vulnerabilities in the backend and 0 in the frontend.
- **Bundle — fixed during this audit:** first-load JavaScript had grown
  from 166 kB (A6) to 234.5 kB gzipped, because every visitor downloaded
  all three translation files.
  - Myanmar and Arabic now load only when chosen (13 kB gzipped each).
  - First load is now **209.7 kB**. The remaining growth over A6 is the
    i18n library plus English strings (24.5 kB) and the B-section
    features.
  - Commit `e0949a2`. The B15/B16 suites pass with it.

### Blocked on the owner (3)

- **Phase 2 — real email.** The code is complete. Without mail settings,
  emails are logged to the console, which is what every local run used.
  - A real inbox test needs your email account.
  - Render's free tier blocks SMTP, so production needs an API-based
    provider (e.g. Brevo). That means a new account, which Claude
    doesn't create.
- **A4 — CI on GitHub.** The workflow runs exactly the steps verified
  above: backend tests, then frontend lint + `check:i18n` + build.
  - They all pass locally. Only the first GitHub run is missing, which
    needs `git push`.
- **A5 — keep-alive.** The deployed backend answered the ping, but the
  first request took **22.9 s** (a cold start) and the next took 0.9 s.
  - That confirms the free instance is sleeping, because the schedule
    only runs after `dev` is merged into `master`.

---

## Issues seen during the pass (none are app bugs)

- **Network timeouts to an external resource (Google Fonts):**
  - Two `ERR_CONNECTION_TIMED_OUT` console errors in the first two C3
    runs (all 27 checks passed both times).
  - One on the first English A3 run (light, 390px, /login), which also
    made that screenshot fall back to a system font.
  - Reruns were clean, and the C3 test now logs the URL of any failed
    request.
  - **Recommendation:** self-host the three fonts so the app doesn't
    depend on Google's servers (also better for privacy and offline use).
- **The browser suites weren't in the repository.** They lived only in
  Claude's temporary workspace, so nobody else could rerun them. They are
  now in `e2e/`, with portable paths, a runner (`run-all.sh`) and a
  README. The path-sensitive suites, the demo-seed check and the audit
  checks were rerun from there and all passed.
- **Two audit checks had false positives** on the first run: they
  matched comments that describe the old fixes. The checks were
  corrected to look at code only. Nothing in the app changed.
- **Pixel-comparison differences** (English and Myanmar against the
  pre-B16 screenshots):
  - The intended ones: the Language screen's third option, and the
    landing header's language select.
  - Timestamps and relative times, which depend on when the test ran.
  - Tiny anti-aliasing differences on Burmese glyphs (1–64 px), which
    also appear between two runs of unchanged code.

## Known limitations (recorded per item in ROADMAP.md)

- Stories and posts in the demo seed have no images, because local dev
  has no media storage. Everyone shows initials.
- Groups have no cover images, invites or pinned posts. Pages have no
  avatars, multiple admins or insights.
- Translations of Myanmar and Arabic were written by Claude and should
  get a native-speaker review. Posts themselves are not
  machine-translated.
- Legal pages are drafts, marked as such on the page.

## Owner actions, in order

1. Push `dev`, check that both CI jobs pass on GitHub (A4), then open a
   PR `dev` → `master`.
2. Back up the production database, then run migrations **015 → 027** in
   order (commands in ROADMAP.md → NEEDS OWNER; 021 must be run on its
   own).
3. Deploy the backend and frontend, then run
   `node scripts/make-admin.js <your username>`.
4. Merge into `master`, trigger the Keep-alive workflow once (A5), and
   confirm there's no cold start after an idle stretch.
5. Before public launch: a legal review of `/terms` and `/privacy` (add a
   contact email), a native-speaker review of Arabic and Myanmar, and an
   email provider for production (Phase 2).
