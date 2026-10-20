# Browser test suites (e2e)

These drive the real app in **headless Microsoft Edge** against a throwaway
local stack. They were used to verify every roadmap item and the C4 audit
(`../AUDIT_REPORT.md`). They complement the backend API tests (`backend/`,
`npm test`), which run in CI.

## One-time setup (Windows + Git Bash)

1. **PostgreSQL 17** installed. The tools are expected in
   `C:\Program Files\PostgreSQL\17\bin`; set `PG_BIN` (e.g.
   `export PG_BIN="/c/path/to/bin"`) if yours are elsewhere.
2. **Microsoft Edge** installed (the suites use the installed Edge, so
   there's no browser download).
3. `npm install` in `backend/`, `frontend/` and `e2e/`.
4. Run the backend tests once (`cd backend && npm test`). That creates the
   isolated test database cluster (`backend/tests/.pgdata_test_cluster`,
   port 55433) that these suites reuse.

Nothing here reads your `.env` database. Every suite runs against a fresh
`mysocialapp_e2e` database on the test cluster, with the backend on :3000
and Vite on :5173 (stop your own dev servers first).

## Running

```bash
cd e2e
npm test              # all feature suites + the visual matrix in EN/AR (~35 min)
npm run test:audit    # also the demo-seed check and the C4 audit checks
```

To run a single suite: `npm run up`, then `node b16-rtl.cjs`, then
`npm run down`. To run a few, each on a fresh stack:
`E2E_ONLY="b9-dm day12-report a3" bash run-all.sh` ("a3" = the visual
matrix; an unknown name stops the run).

The two longest suites run in parts of a few minutes each, every part on
its own fresh stack (AUDIT_REPORT_3 A3): `day26-a11y` as
`day26-a11y-light`, `-dark` and `-ar` (Arabic + keyboard), and `a3` as
`a3-en-light`, `a3-en-dark`, `a3-ar-light`, `a3-ar-dark`. `E2E_ONLY` takes
the whole suite or one part, e.g. `E2E_ONLY="a3-ar-dark"`. By hand, on a
fresh stack: `A11Y_PART=dark node day26-a11y.cjs`,
`A3_LANG=ar A3_THEME=dark node a3-visual.cjs`.

## In CI (GitHub Actions, Linux)

`.github/workflows/ci.yml` runs these suites on Ubuntu. The runner already
has Microsoft Edge, and the scripts find the PostgreSQL tools on PATH
(`pg.cjs` / `pg-tools.sh`).

- **Database:** Postgres comes from a service container on :55433.
  `E2E_EXTERNAL_DB=1` tells `e2e-up.sh` / `e2e-down.sh` not to start or
  stop the local test cluster.
- **Browser tests (smoke)**, on every push: `E2E_ONLY` = the walkthrough,
  reports/moderation, the production build + CSP, the bot checks, and the
  core user journeys (`journeys-core`).
  About 10 minutes; the repo is private and its CI minutes are limited.
- **Browser tests (full)**, on pull requests to `master` and by hand
  (Actions → CI → Run workflow): everything, including the EN/AR
  visual matrix, with Noto fonts installed (Arabic, and other scripts in test posts).
- **When a job fails:** it uploads `out-*.txt`, the logs and the
  screenshots as an artifact named `e2e-output-…`.
- `backend/tests/api/ciWorkflow.test.js` checks the workflow against
  these scripts: suite names, ports, and that no suite is left out.

**Production build + real headers:** prefix any of the above with
`E2E_FRONTEND=dist` (e.g. `E2E_FRONTEND=dist bash run-all.sh`). The stack
then builds the frontend for production and serves it with
`serve-dist.cjs`, which applies `frontend/vercel.json`'s headers (CSP and
the rest) and SPA rewrite like Vercel. The only difference is that the
production API origin in `connect-src` is swapped for the local API. Any
CSP violation is a console error, so it fails the suite. The default
(no variable) is the Vite dev server.

Each suite prints `PASS`/`FAIL` lines and fails on any browser console
error. Full output goes to `out-<suite>.txt`, and screenshots to `*.png` /
`a3-shots*/` (all gitignored).

| Suite | What it checks |
| --- | --- |
| `journeys-core`, `journeys-social`, `journeys-safety` | The 15 most important user journeys, only through the UI -- see [JOURNEYS.md](JOURNEYS.md) |
| `a2-walkthrough` | The main user journey from signup to logout |
| `a3-visual` | Every route × 375/390/430 px × light/dark (`A3_LANG=en\|ar`, `A3_THEME=light\|dark`) |
| `b1-reactions` | B1: reactions on posts |
| `b2-media` | B2: posts with several photos (carousel), and picking photos in the composer |
| `b3-stories` | B3: the stories tray and viewer |
| `b4-comments` | B4: comment replies and likes; comments 50 at a time with "View more comments" (EN/AR) |
| `b5-audience` | B5: who can see a post (public / followers) |
| `b6-tabs` | B6: profile tabs (posts, photos, tagged) |
| `b7-explore` | B7: Explore: trending hashtags and popular posts |
| `b8-pymk` | B8: People you may know |
| `b9-dm` | B9: chat extras (replies, edits, photos with retry); the inbox 20 chats at a time |
| `b10-groups` | B10: group chats: create, rename, add and remove people, leave |
| `b11-settings` | B11: notification settings |
| `b12-admin` | B12: admin moderation |
| `b13-groups` | B13: groups (communities): create, private join requests, posting |
| `b14-pages` | B14: pages: create, follow, post as the page |
| `b15-lang` | B15: switching the language (English / Arabic) |
| `b16-rtl` | B16: Arabic right to left, end to end |
| `c1-seed` | The world created by `npm run seed:demo` (needs the seed first) |
| `c2-legal` | Terms and Privacy pages |
| `c3-landing` | The public landing page |
| `c4-audit-checks` | Route auth table, Phase 1 fixes, API timings, `npm audit`, the deployed keep-alive ping |
| `day2-own-post` | Day 2: a new post is the first card on Home (EN/AR, light/dark, 375px–desktop; one post in Burmese) |
| `day5-email-off` | Day 5: with no email provider the verify banner hides and forgot-password explains itself (EN/AR); with email on both still work |
| `day8-sessions` | Day 8: changing the password in Settings signs out the other devices (sent to login), keeps this one signed in; a mistyped password no longer logs you out (EN, AR RTL) |
| `day8-sessions-list` | Day 8: Settings → Where you're logged in: lists devices, logs one or all others out, and Log Out ends the session on the server (EN, AR RTL incl. word order) |
| `day10-errors` | Day 10 (production build only, run by run-all on a dist stack): a render crash shows a translated "Something went wrong" screen instead of a blank page, is reported, grouped with a count, and can be read and resolved in Admin → Errors (EN, AR RTL) |
| `day11-bots` | Day 11 (bot checks on): honeypot, form timing and login slow-down stop scripts; real people sign up and log in |
| `day11-turnstile` | Day 11 (Turnstile on, production build): the human check on signup and forgot-password, CSP included |
| `day12-report` | Day 12: reporting comments and messages, and what the moderator sees |
| `day12-review` | Day 12: Admin > Reports: removing a comment and a message (live), suspending an account |
| `day16-language` | Day 16: the app language is saved on the account and follows you to other devices |
| `day19-links` | Day 19: links are clickable; the first gets a preview card (posts and messages) |
| `day19-share` | Day 19 (production build): share cards for link-preview crawlers, and the redirect for people |
| `day20-only-me` | Day 20: "only me" posts stay with their author |
| `day22-push` | Day 22 (production build, stub push service): turning web push on and receiving a notification |
| `day23-mute` | Day 23: the Messages notification switch, and muting one chat |
| `day24-report-places` | Day 24: reporting groups and pages; the moderator removes one |
| `day26-a11y` | Day 26: axe (WCAG 2.1 A + AA) on every page, light and dark, and Arabic; keyboard focus rings. In 3 parts: `day26-a11y-light`, `-dark`, `-ar` |
| `day27-perf` | Day 27: about a million seeded rows; every main read endpoint stays fast and uses its index (~1 min since Day 74) |
| `day28-export` | Day 28: Download your information (the JSON file) |
| `day30-guard` | Day 30: account-only screens send logged-out visitors to Login and back |
| `day31-reactions` | Day 31: reacting to messages, live for both people |
| `day32-forward` | Day 32: forwarding a message to several chats (server-side chat search) |
| `day33-group-admins` | Day 33: group chat admins |
| `day34-group-photo` | Day 34: a group chat's photo (and an upload failure shown properly) |
| `day36-profile`, `day36-cover`, `day36-pinned` | Day 36: profile links and joined date; cover photo; pinned post |
| `day37-friends` | Day 37: friends (mutual follows) and the connections lists |
| `day39-pymk` | Day 39: hiding a "People you may know" suggestion |
| `day40-hashtag-top` | Day 40: a hashtag page's Top / Recent tabs |
| `day42-search` | Day 42: ranked search: people, hashtags, posts |
| `day43-zawgyi` | Day 43: Burmese typed in Zawgyi is stored and shown as Unicode |
| `day44-polls` | Day 44: poll posts: building, voting, results |
| `day45-drafts` | Day 45: drafts and scheduled posts |
| `day46-collections` | Day 46: saved collections |
| `day47-privacy` | Day 47: mute, restrict (comments wait for approval), close friends, who may message / comment |
| `day48-activity` | Day 48: your activity log |
| `day49-hidden-words` | Day 49: Hidden words: warn and hide |
| `day49-spam` | Day 49 (spam checks on): the same post again, posting too fast |
| `day50-group-bans` | Day 50: group moderation: remove and ban |
| `day53-page-admins` | Day 53: page admins |
| `day55-events` | Day 55: events: create, Discover, Going / Interested, cancel |
| `day57-storage` | Day 57: photos are shrunk in the browser before upload; the daily upload budget |
| `day58-open-states` | Day 58: axe and keyboard checks on open dialogs, menus, sheets and pickers |
| `day60-settings` | Day 60: Settings has no dead rows (only the paused features say so) |
| `day61-overview` | Day 61: Admin > Overview: totals, shortcuts, daily charts |
| `day63-log` | Day 63: Admin > Log: moderation decisions as sentences |
| `day72-offline` | Day 72: offline: the banner on every screen, Home shows its saved posts (EN/AR) and reloads when back online; a message written offline waits and goes by itself (or Don't send); logout leaves nothing |
| `day72-install` | Day 72: "Install the app" in the Menu: the browser's own dialog when it offers one, the Safari steps on an iPhone (AR, RTL) |
| `day72-pwa` | Day 72 (production build): the service worker takes control with only its two caches; manifest and icons load; offline, a reload and a deep link still open the app |
| `day77-login-alert` | Day 77: a log-in from a new kind of device (an iPhone) gives a "New login" alert naming it, and "Check your devices" opens the device list (EN/light, AR/dark) |
| `day74-feed-paging` | Day 74: Home loads later pages by the server's cursor: 45 posts (two in the same millisecond across a page break) each arrive once, newest first, in EN/light and AR/dark |
| `journey-kit`, `cloudinary-stub` | Helpers for the journeys: shared steps, and a local stand-in for Cloudinary (`E2E_MEDIA=1`) |
| `link-stub`, `push-stub`, `turnstile-stub`, `serve-dist`, `pg`, `legal-dates`, `golive-smoke` | Helpers: a stub website, push service and Turnstile verifier; the production build with Vercel's headers; where psql lives; the legal pages' dates; the GO LIVE API smoke |
| `golive-rehearsal.sh` | `bash golive-rehearsal.sh [--old]`: GO LIVE rehearsal. It runs every migration from 015 on a local copy of the live (014) schema, compares the result with the dev schema, smoke-tests the new backend (and with `--old`, the live `master` backend) on it, and checks that the `.down.sql` files restore the live schema (see `../GO_LIVE_CHECKLIST.md`) |
| `pixel-compare` | `node pixel-compare.cjs <baselineDir> <currentDir>`: pixel diff of two sets of A3 screenshots |

**Timing noise:** timestamps ("5m ago") depend on when a suite runs, and
Burmese glyph anti-aliasing can differ by a few pixels between runs.
Account for both when comparing screenshots.
