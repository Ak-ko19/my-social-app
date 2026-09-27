# MySocialApp Roadmap

Status legend: ⬜ NOT CHECKED · 🟡 PARTIAL · ✅ VERIFIED

**Current status (2026-09-24):** Phase 1 history is fully verified. Phase 2
(real email) is code-complete but not yet configured/tested with a real
Gmail App Password — that's the next thing to close out before starting
Section A.

This file supersedes the ad-hoc "Phase 1 / Phase 2 / ..." numbering used
earlier in chat — those are preserved below as history under their own
heading. Going forward, work is tracked as Section A / B / C items below.

---

## HISTORY (pre-existing phases, kept for record)

### Phase 1 — Demo-breaking bug fixes
**Status:** ✅ VERIFIED (2026-09-23)
**Done when:** search reachable from the UI, notification badge reflects
real unread count, Menu screen shows the real logged-in user, no fake
Stories data shown, dead `/uploads` route/files removed.
**Notes:**
- 1.1 Search entry point wired — `TopAppBar.jsx` search icon now
  navigates to `/search`.
- 1.2 Real notification badge — `TopAppBar.jsx` + `SettingsScreen.jsx`
  now use the real `useUnreadCount` hook instead of a hardcoded `3`.
- 1.3 Menu screen shows real user — `MenuScreen.jsx` fetches
  `GET /profile/me` instead of importing `mockCurrentUser`;
  `ProfileSummaryRow.jsx` extended to accept a real `src` avatar.
  (`SettingsScreen.jsx` still has the same mock-user pattern at its own
  profile row — flagged, not yet fixed, folded into A3 below.)
- 1.4 Fake StoriesRow removed — `HomeFeed.jsx` no longer renders
  `MOCK_STORIES`; `StoriesRow.jsx` component itself left intact,
  ready for B3 (real Stories) to wire back in.
- 1.5 Dead `/uploads` cleanup — confirmed zero DB rows reference legacy
  `/uploads/...` paths before removing; `server.js` static route + the
  2 orphaned files deleted.

### Phase 2 — Real email delivery
**Status:** 🟡 PARTIAL (code complete 2026-09-23, not yet configured/tested)
**Done when:** Gmail App Password set in real `backend/.env`, a real
signup-verification email and a real password-reset email both received
and successfully completed end-to-end.
**Notes:**
- `backend/utils/email.js` rewritten to use Nodemailer over generic SMTP
  env vars (`EMAIL_HOST/PORT/USER/PASS/FROM`); falls back to the original
  console.log behavior if those aren't set, never throws on send failure.
- `backend/controllers/authController.js`: hardcoded `localhost:5173`
  links replaced with `FRONTEND_URL` env var (needed for links to work
  against a deployed frontend, not just local dev).
- `nodemailer` added to `backend/package.json`; `.env.example` documents
  the new vars and the Gmail App Password setup steps.
- **Still open:** user hasn't set up the Gmail App Password or run the
  real-email test yet. Do this before starting Section A.

---

## SECTION A — Foundation

### A1 — Automated API tests
**Status:** ✅ VERIFIED (2026-09-24)
**Done when:** Jest + Supertest installed in `backend/`; test coverage
exists for auth, profile, post, feed, like, comment, follow/private,
block, DM, search, bookmarks — happy path plus the key negative cases
(ownership rejection, block enforcement, private-account gating);
`npm test` runs and passes locally.
**Notes:**
- 80/80 tests passing across 10 files (`backend/tests/api/`), ~25s,
  exits cleanly on its own (no `--forceExit`, no open handles).
- Runs against a real, isolated throwaway Postgres 17 cluster
  (`tests/.pgdata_test_cluster`, port 55433, trust auth, gitignored),
  auto-started by `tests/globalSetup.js` and stopped by
  `globalTeardown.js`. Replaced an earlier pg-mem attempt, which can't
  run correlated subqueries / LATERAL / row-value comparisons — the
  codebase's core block/privacy query patterns.
- Hang fix (2026-09-24): `npm test` hung forever in globalSetup on
  Windows because (1) `pg_ctl start` was run via `execFileSync` with
  piped stdio, which postgres.exe inherits so EOF never arrives — fixed
  with `stdio: 'ignore'`; (2) the server log lived inside the data dir,
  causing a "sharing violation" during recovery fsync — moved to
  `tests/.pgdata_test_cluster.log`.
- The 2 DM tests previously `it.skip`'d for pg-mem gaps (message history,
  conversation-list unread count) are re-enabled and pass; the delete-
  message test now also checks scrubbing via the history endpoint.
- Each test file closes its pg Pool in `afterAll`; rate limiters are
  no-ops under `NODE_ENV=test`; `server.js` only listens / inits
  Socket.io when run directly, so Supertest can import `app`.

### A2 — Reliability
**Status:** ✅ VERIFIED (2026-09-24)
**Done when:** every data-fetching screen has consistent loading/empty/
error states (Notifications and Messages currently lack some of these
per the 2026-09-23 audit); Socket.io client reconnects cleanly after a
network drop (test via devtools offline toggle); no unhandled promise
rejections or console errors during a normal end-to-end walkthrough.
**Notes:**
- Screen states (2026-09-24): every data-fetching screen now has
  loading + empty + error-with-"Try again". Reused the existing
  `FeedErrorState` everywhere instead of adding a new component.
  - Notifications: error state gets a retry button; fixed a stale-closure
    bug where mark-read/mark-all used an old `notifications` array;
    mark-read failures now show inline instead of only `console.error`.
  - Search: added a "Searching…" state (it had none) plus a guard so an
    older, slower search can't overwrite a newer one.
  - BlockedUsers / FollowRequests / HashtagFeed / PostDetail / Profile:
    retry added. PostDetail/Profile show no retry on 404, since retrying
    "not found" does nothing. Unblock/approve/deny failures now show inline.
  - Messages already had skeleton/empty/error+retry; left as-is.
- Socket reconnect: `SocketProvider` already had infinite backoff
  reconnect, and the open thread already refetched on reconnect. Gap
  fixed: the inbox list (`useConversations`) never resynced, so messages
  that arrived during an outage were missing. It now refetches on every
  reconnect. Added `ConnectionBanner` to Messages + Conversation: it shows
  "Reconnecting…" after the socket has been down for more than 2s (so the
  normal first connect never flashes it).
- Verified at the protocol level: a Node socket.io-client with the same
  options as `SocketProvider` was run against a local backend on a
  throwaway DB (isolated test cluster, not the real DB). Killing and
  restarting the backend gave disconnect → backoff retries → auto
  reconnect → server re-joined the conversation room → a new message was
  delivered live. PASS.
- Lint: fixed the last 2 `exhaustive-deps` warnings (Notifications,
  EditProfile). `eslint src` is now clean and `vite build` passes.
- Also fixed (found during A2): Search.jsx called the `optionalAuth`
  search endpoints with no token, so results were anonymous. Users the
  viewer blocked still appeared, and followed private accounts' posts
  were hidden. It now sends the token. `useMentionAutocomplete` →
  `searchUsers()` has the same no-token pattern; left for A6's audit.
- Browser verification (2026-09-24): the Chrome extension still wasn't
  connected, so I drove the installed Edge headlessly with playwright-core
  (installed in a scratch dir, not added to the project). This ran against
  the throwaway local stack (isolated test cluster DB, email/Cloudinary
  blanked). A 22-step walkthrough of feed, like, post detail, hashtag,
  profile, search, notifications, blocked, follow-requests, saved, menu,
  settings, edit-profile, messages and conversation all passed, with 0
  console errors, page errors or unhandled rejections.
- Reconnect verified by killing the backend: the banner appeared. A
  message inserted into the DB during the outage (so it could only
  arrive via resync) appeared after restart, the banner cleared, and
  sending worked again. Used a backend kill instead of DevTools
  "Offline" because Chromium's offline emulation doesn't close an
  already-open WebSocket.

### A3 — Visual consistency
**Status:** ✅ VERIFIED (2026-09-24)
**Done when:** Login, Signup, ForgotPassword, ResetPassword, CreatePost,
EditProfile, Notifications, Messages, Conversation, Search are all
restyled into the PhoneShell/design-token system (currently old raw
inline-style pages sitting next to the polished rebrand screens);
`SettingsScreen.jsx`'s own mock-user profile row fixed the same way
`MenuScreen.jsx` was in Phase 1; dark mode verified correct on every
screen, not just the newer ones; tested at common mobile widths
(375/390/430px) with no horizontal scroll or clipping.
**Notes:**
- All 10 listed screens now render inside PhoneShell, using one shared
  stylesheet (`styles/screens.css`) built on the rebrand tokens. I chose
  that over ten near-identical per-screen CSS files. The pages have no
  inline styles or hardcoded colors left.
  - Auth screens (Login/Signup/Forgot/Reset) are centered cards with the
    Logo. The old `<a href>` links are now router `<Link>`s, so clicking
    them no longer reloads the whole app.
  - CreatePost/EditProfile/Notifications/Search/Messages have the
    rebrand header (back button + title) and the shared form, button and
    card classes.
  - Conversation is now a full-height chat: header, a thread that
    scrolls on its own, and the composer pinned to the bottom. This
    replaces the old fixed `60vh` bordered box.
- Decision: PhoneShell gained a `hideTabBar` prop. The auth screens and
  the chat thread hide the bottom nav; every other screen keeps it.
- Settings' profile row now shows the real logged-in user. I extracted
  MenuScreen's `/profile/me` fetch into a shared `useCurrentUserSummary`
  hook, used by Menu, Settings and HomeFeed's composer avatar.
  `data/mockCurrentUser.js` had no users left, so I deleted it.
- Fixes found while checking:
  - The bottom tab bar floated mid-screen on short pages
    (`position: sticky` only pins once content overflows). The shell is
    now a flex column and the tab bar uses `margin-top: auto`. This also
    fixes the existing Blocked Users and Saved screens.
  - The Settings logout button kept a light-pink fill in dark mode; it
    now has a dark override.
  - The initials avatar used a pale badge color that glared on dark; it's
    now the solid accent.
  - `index.css`'s pre-rebrand `#root { text-align: center }` and large
    `h1`/`h2` globals leaked into forms and post cards. Neutralized inside
    the migrated screens and `.post-card`. I left the globals themselves
    alone, since older component CSS may still rely on them.
  - Search's "Message" button navigated to `/messages/<userId>`, but that
    route takes a conversation id, so it opened the wrong chat or none.
    It now creates or fetches the direct conversation first (same as
    ProfileScreen). Verified: clicking it opens the correct chat.
- Decision: I committed the already-verified Phase 1 frontend changes
  (uncommitted since 2026-09-23) as their own commit first, so A3's
  SettingsScreen/MenuScreen/HomeFeed edits didn't bundle them.
- Verified in headless Edge against the throwaway stack: 20 routes
  (every authed and public route) × 375/390/430px × light/dark = 120 page
  checks, 0 failures. Each check covers: no horizontal scroll, no element
  past the viewport edge, tab bar at the bottom edge on short pages, no
  large light surface while dark mode is on, correct `data-theme`, and
  0 console errors. I also reviewed screenshots at 390px in both themes
  by eye. The A2 walkthrough still passes 22/22; eslint is clean, the
  build passes, and backend tests are 80/80.
- Not done (outside the done-when): the Follow/Like buttons inside shared
  feed components still use the older `feed-btn` look, which is slightly
  different from the new `btn` classes. I left them because they're
  shared with the feed. Candidate for a later polish pass.

### A4 — GitHub Actions CI
**Status:** 🟡 PARTIAL (built + verified locally 2026-09-24; first GitHub run needs a push — see NEEDS OWNER)
**Done when:** a workflow in `.github/workflows/` runs the test suite
(from A1) on every push/PR to `main`; pass/fail status visible on GitHub.
**Notes:**
- `.github/workflows/ci.yml` has two jobs on every push/PR:
  - **Backend API tests:** the A1 suite against a `postgres:17` service
    container.
  - **Frontend:** `npm run lint` + `npm run build`.
- It needs no GitHub secrets, and a newer push cancels a stale run.
- Decision: the triggers are `master`, `main` and `dev`, not just `main`.
  This repo's default branch is actually `master`, so a `main`-only
  trigger would never fire.
- Making the suite CI-runnable:
  - `tests/globalSetup.js` hardcoded Windows Postgres paths. When
    `TEST_DATABASE_URL` is set, it now loads `fixtures/schema.sql` into
    that database (wiping `public` first, so reruns are safe) instead of
    managing the local cluster, and `globalTeardown.js` leaves the
    database alone.
  - The local Windows flow is unchanged.
- Safety fix found along the way: `server.js`'s dotenv was loading the
  developer's real `backend/.env` into every test run. With the Phase 2
  Gmail App Password set, each `npm test` would have sent ~100 real
  signup emails. New `tests/setupEnv.js` (Jest `setupFiles`) pins
  test-only JWT/email/Cloudinary/DB values first; dotenv never overrides
  already-set vars.
- Verified locally:
  - Normal mode passes 80/80.
  - CI mode (`TEST_DATABASE_URL` → a separate throwaway DB) passes 80/80
    twice in a row, and the database server stays running afterwards.
  - The workflow YAML parses.
  - `npm ci --dry-run` accepts both lockfiles.
  - All 385 relative imports match on-disk filename case (Linux is
    case-sensitive; Windows would hide a mismatch).
- Not yet verified: an actual run on GitHub, which needs a push. See
  NEEDS OWNER. Flip to ✅ once the Actions tab shows it green.

### A5 — Keep-alive cron
**Status:** 🟡 PARTIAL (built + ping verified 2026-09-24; schedule only runs once merged to master — see NEEDS OWNER)
**Done when:** a scheduled GitHub Actions workflow pings a lightweight
endpoint (e.g. `GET /`) on the deployed Render backend frequently enough
to prevent free-tier cold-start spin-down; verified by checking response
time stays low even after a long idle gap.
**Notes:**
- Deploy status checked (2026-09-24): the backend is live at
  `https://my-social-app-ecjg.onrender.com`. That URL came from the
  committed `frontend/.env.production`; I read it via `git show` and
  didn't open any local `.env` files.
  - Cold hit: `GET /` took 23.2s.
  - Warm hit right after: 0.56s.
  - So the spin-down problem is real.
- `.github/workflows/keepalive.yml` pings `GET /` every 10 minutes.
  - That endpoint is plain text with no DB query, so the ping stays cheap.
  - It retries through a cold start and logs the response time, so each
    run shows whether it hit a warm or cold instance.
  - It has a manual `workflow_dispatch` trigger too.
  - The URL can be overridden with a `KEEPALIVE_URL` repo variable.
    That's a plain Actions variable, not a secret or a new account.
- Decision: 10 minutes, not 14. GitHub can delay scheduled runs by
  several minutes, and Render idles after about 15.
- Budget check: an always-awake free service uses about 730 of Render's
  750 free hours a month. That's $0 for this one backend. A second free
  Render service would need a rethink.
- Verified locally: the YAML parses, and the exact curl command from the
  workflow returns HTTP 200 against the live backend.
- Not yet verified: the schedule itself. GitHub only runs `schedule`
  workflows from the default branch (`master`), so this starts working
  only after dev → master is merged, which is owner-only. See NEEDS OWNER.

### A6 — Security & performance audit
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** every route re-checked for an auth/ownership check where
needed (backend audit on 2026-09-23 found no missing checks, but this is
a formal re-pass); no N+1 query patterns in feed/comments/notifications;
DB indexes reviewed against actual query patterns (migrations 001/002
already added several trigram/perf indexes — confirm still sufficient);
frontend production bundle size reviewed for accidental bloat (same class
of issue already caught once in `MenuScreen.jsx`'s icon-import choice).
**Notes:**
- **Route re-pass (all 56 routes).**
  - Ownership scoping is correct on every authed write: posts, comments,
    notifications, follow-request approve/deny, conversations (service
    layer plus participant middleware), reports, profile, block.
    `/profile/me` is registered before `/profile/:id`, so there's no
    route shadowing.
  - The gaps were all *visibility*, not ownership. Fixed:
    - Like and comment ignored private/block/deactivated rules. Anyone
      could interact with a post they couldn't see, and the author got
      notified.
    - Bookmark checked blocks only.
    - `GET /posts/:id/comments` and `/likes` were public with no check.
    - Private accounts' follower/following lists were readable by anyone.
  - All of these now use `services/postVisibilityService.getVisiblePost`
    (the same rules as `GET /posts/:id`). The lists use
    `connectionsAccessError`: owner and accepted followers only; counts
    stay public.
  - Also fixed:
    - `PUT /profile` now validates the email format like signup does.
    - Changing your email resets `email_verified`, and the frontend
      re-syncs the verify banner.
    - `GET /test-db` no longer echoes DB error text.
    - @-mention suggestions now send the token, so blocked users are no
      longer suggested.
  - Regression I caught in my own change: `fetchComments` sent no token,
    so followers of a private account got a 404 on comments once the
    visibility check existed. Fixed. A browser check (headless Edge)
    fails without the fix and passes with it.
- **N+1:** none. Hashtag and mention writes are batched. Feed and post
  counts use correlated subqueries backed by indexes. Comments load
  lazily per post, only when opened, not per feed render.
- **Indexes: new migration 015.**
  - `conversation_participants(user_id)`: every socket connect and inbox
    load was a full scan, because the primary key leads with
    `conversation_id`.
  - Foreign-key indexes for the cascades behind account and post
    deletion: `comments.user_id`, `likes.user_id`,
    `notifications.actor_id`, `messages.sender_id`, `bookmarks.post_id`.
  - Verified on a throwaway DB: up → re-up → down → up all work, and
    EXPLAIN shows an index scan.
  - **Not applied to production**; that's an owner step (NEEDS OWNER).
  - 001/002's feed, comment, notification and trigram indexes are still
    sufficient for the hot read paths.
- **Bundle.** Per-package breakdown via source-map-explorer: no
  accidental bloat, and lucide is properly tree-shaken at 17.8 kB. I
  added route-level code splitting: HomeFeed stays eager, every other
  screen is `React.lazy`, and PhoneShell's `<Suspense>` keeps the tab bar
  visible while a screen loads.
  - First-load JS: 190.5 → 166.1 kB gzipped. The >500 kB chunk warning
    is gone.
  - The service worker's network-first runtime cache stores lazy chunks
    on first visit, so offline behavior is unchanged.
- **Tests.**
  - New `tests/api/visibility.test.js` (12 tests). I confirmed they fail
    against the pre-fix controllers.
  - Backend 92/92.
  - A3 visual matrix 120/120 and A2 walkthrough 22/22 (both with lazy
    loading); eslint clean.
- Decision logged: a mention in a private account's post still notifies
  the mentioned user even if they don't follow the account (the author
  chose to mention them; Instagram behaves the same way). Left as-is.

---

## SECTION B — Social features (Facebook/Instagram level)

### B1 — Reactions (like, love, haha, wow, sad, angry)
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** likes extended with a reaction type (new column or new
table), API supports setting/changing a reaction, frontend reaction
picker UI, existing plain "like" data stays compatible/migrated.
**Notes:**
- **Schema (migration 016):** `likes.reaction` VARCHAR(10), NOT NULL,
  DEFAULT 'like', with a CHECK over the six types. Decision: I extended
  `likes` rather than adding a new table.
  - A reaction is a like with a type, and `UNIQUE(post_id, user_id)`
    already enforces one per user per post.
  - Every existing like becomes 'like' with no data migration, and the
    old like/unlike API is untouched.
  - Verified on a pre-016 DB: an existing like became 'like', invalid
    types are rejected, and down → up works.
- **API:**
  - New `PUT /posts/:id/reaction {reaction}` sets or changes a reaction
    in one atomic upsert. It returns 201 when adding and 200 when
    changing, and it's visibility-checked (A6 rules).
  - It notifies the author only on the first reaction, so switching
    like → love → haha doesn't spam them.
  - `DELETE /posts/:id/like` removes any type. `POST /posts/:id/like`
    still works and means 'like'.
  - All like mutations and `GET /posts/:id/likes` return
    `{ likeCount, reactionCounts, myReaction }`.
  - Post payloads (feed, posts, detail, hashtag, bookmarks) add
    `my_reaction` and `reaction_counts`, from one shared SQL fragment in
    `services/reactionService.js`.
- **UI (`components/feed/ReactionButton.jsx`):**
  - Tap = like or remove, as before.
  - The picker opens on long-press (touch; it doesn't also like),
    hover (mouse), or ↑ (keyboard). ←/→ move between reactions, Esc
    closes, and tapping outside dismisses it.
  - The button shows the chosen emoji, label and color. The stats line
    shows the top 3 reaction emojis plus "N reactions".
  - `useLikeToggle` is now reaction-aware (optimistic, then reconciled
    with the server's summary) and keeps its old fields.
- **Bugs found by the browser test and fixed:**
  - Hovering right after a click never opened the picker (no new
    pointerenter fires). The hover timer now also arms on pointermove.
  - After a keyboard choice, the button went `disabled` while the
    request was pending, which threw focus to `<body>`. It now uses
    `aria-busy` instead; the hook already blocks double submits.
- **Test infra:** `globalSetup` now rebuilds the test schema on every
  run. Before, `schema.sql` changes were silently ignored once the local
  test DB existed.
- **Verified:**
  - 9 new API tests; backend 101/101.
  - B1 browser test 14/14 in headless Edge: tap, hover → Love, persists
    after reload, full keyboard path with focus return, remove, touch
    long-press, picker fully on-screen at 375px in dark mode, 0 console
    errors.
  - A3 visual matrix 120/120, A2 walkthrough 22/22, eslint clean, build
    passes.
- **Deploy order (owner):** run migration 016 on production **before**
  deploying this backend. The post queries select `likes.reaction` and
  would fail without it. See NEEDS OWNER.
- **Not done (out of scope):** reaction notifications still read "liked
  your post" whatever the type, since notifications has no reaction
  column. There's also no "who reacted" list; `GET /posts/:id/likes`
  returns counts only.

### B2 — Multiple images per post (carousel)
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** a `post_media`-style join table replaces the current
single `image_url` column on `posts`; upload UI supports multi-select;
feed and post-detail render a swipeable carousel.
**Notes:**
- **Schema (migration 017):** `post_media(post_id, url, position)` with
  `UNIQUE(post_id, position)`, which also serves the per-post lookup. It
  cascades on post delete.
  - It backfills every existing image post at position 0. Verified on a
    pre-017 DB: the image post was backfilled, the text post skipped, and
    down → up works.
  - Decision: `posts.image_url` is **kept** and mirrors the first image,
    rather than being dropped as the done-when wording suggested.
    Dropping it would break the deployed frontend and search results
    mid-rollout. `post_media` is the source of truth for the full list.
- **Upload and API:**
  - `POST /posts` accepts up to 10 `images` fields; the legacy single
    `image` field still works.
  - Uploads to Cloudinary run in parallel and keep their order. The post
    and its media rows are inserted in one SQL statement, so a post can't
    exist with only some of its images.
  - More than 10 images → 400 "You can attach up to 10 images" (multer's
    own message was just "Unexpected field").
  - Every post payload adds `media: [{url}]` in order, via
    `reactionService.mediaColumnSql()`.
- **UI:**
  - CreatePost: multi-select that adds across picker opens, a thumbnail
    grid with per-image remove, a cap at 10 with a message, blob URLs
    revoked, and a "Posting…" state that blocks double-submit during
    multi-upload.
  - `components/feed/MediaCarousel.jsx`: native CSS scroll-snap (swipe
    and trackpad for free), "n/N" counter, dots, and prev/next buttons
    (hidden on touch-only devices). ←/→ work on the focused track, with
    ARIA carousel/slide roles. A 1-image post renders exactly as before.
  - The carousel is used by PostCard, so the feed, post detail, hashtag
    feed and saved posts all get it.
- **Test infra:** Cloudinary is now mocked in `setupTestApp`, so no test
  can ever upload for real.
- **Verified:**
  - 7 new API tests; backend 108/108.
  - B2 browser test 14/14 in headless Edge: 3-slide carousel, next/prev
    via buttons and keys, 1-image post unchanged, touch swipe at 375px
    with no page h-scroll and arrows hidden, CreatePost add/remove/submit
    (intercepted multipart had exactly 2 `images` parts), 11 → capped at
    10 with a message.
  - Regressions: B1 14/14, A3 120/120, A2 22/22, eslint clean, build
    passes.
- **Deploy order (owner):** run migration 017 **before** deploying this
  backend, since `POST /posts` and every post query use `post_media`.
  See NEEDS OWNER.
- **Not done:** editing a post doesn't add or remove images (text edit
  only, as before). If one upload in a multi-upload fails, the others
  stay in Cloudinary unreferenced — rare and harmless.

### B3 — Stories: real backend + UI, auto-expire 24h
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** a `stories` table with `expires_at`, an upload endpoint,
expiry enforced (query-time filter or cron cleanup), and `StoriesRow.jsx`
(left intact in Phase 1 specifically for this) wired to the real data
instead of removed entirely.
**Notes:**
- **Schema (migration 018):** `stories(user_id, media_url, created_at,
  expires_at DEFAULT now()+24h)` plus `story_views(story_id, viewer_id)`
  for seen state, with cascades and indexes. Verified: up/down/up, and
  the default expiry is exactly 24h.
- **Expiry decision: query-time filter** (`expires_at > now()` in every
  read), not a cron. A story disappears the instant it expires, with no
  job to run or monitor. Expired rows stay in the table; a periodic
  prune can be added later if it grows.
- **API** (all logged-in):
  - `POST /stories` (one image) and `GET /stories` (the tray, grouped by
    author: own first, then authors with unseen stories, then newest).
  - `POST /stories/:id/view` is idempotent. `DELETE /stories/:id` is
    author-only (403 for anyone else).
- **Visibility decision: Instagram model.** You see your own stories
  plus accounts you follow with an accepted follow. A pending request to
  a private account shows nothing; blocks in either direction and
  deactivated accounts are excluded. One shared SQL condition is used by
  the tray and the view check, so they can't drift. Hidden or expired
  stories 404.
- **UI:**
  - `StoriesRow` is wired back into Home with real data. Avatars are real
    buttons; the accent ring means unseen, grey means all seen. "Your
    story" opens your stories, and the + badge (44px hit area) adds one.
  - `StoryViewer` (new) is full-screen and always dark. It has progress
    segments and 5s auto-advance timed from image load. It runs through
    all stories, then on to the next person, then closes. Left/right tap
    zones, ←/→ and Esc all work; focus starts on the close button and
    returns to the opener.
  - Stories are marked seen when shown (optimistic). Your own stories can
    be deleted via the confirm dialog, which pauses the timer.
- **Verified:**
  - 9 new API tests: expiry, visibility incl. pending/blocked, seen
    ordering, delete ownership. Backend 117/117.
  - B3 browser test 16/16 in headless Edge: tray membership and order,
    auto-advance, tap zones, keyboard, focus in and out, seen state
    synced to the server, own-story delete, add-story upload
    (intercepted multipart), 375px full-screen. 0 console errors.
  - All earlier browser suites (A2, A3, B1, B2) still pass; eslint and
    build clean.
- **Deploy order (owner):** run migration 018 before deploying this
  backend. See NEEDS OWNER.
- **Not done (out of scope):**
  - A "who viewed my story" list: the data exists in `story_views`,
    there's just no endpoint or UI.
  - Video stories: images only (see the video budget item in NEEDS
    OWNER).
  - A cleanup job for expired rows.

### B4 — Comment replies (nested) + comment likes
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** `comments.parent_comment_id` added (schema is currently
flat, confirmed 2026-09-23), threaded reply UI, `comment_likes` table +
like button on comments.
**Notes:**
- **Schema (migration 019):** `comments.parent_comment_id` (indexed,
  CASCADE) plus `comment_likes(comment_id, user_id)` as the primary key.
  Verified: existing comments become top-level, and on down a reply is
  kept as a plain comment.
- **Decision: replies are one level deep (Facebook-style).** Replying
  to a reply attaches to the same top-level comment, and the UI
  pre-fills an @mention of whoever you're answering. That keeps threads
  readable at phone width; unlimited nesting collapses on a 375px
  screen. A parent must be on the same post and not across a block.
- **API:**
  - `POST /posts/:id/comments` takes an optional `parentCommentId`.
  - `GET` comments returns `parent_comment_id`, `like_count` and
    `liked_by_me`.
  - `POST` / `DELETE /comments/:id/like` are idempotent and
    visibility-checked (the post's rules plus no block with the comment
    author).
- **Notifications:**
  - New types: 'reply' (to the person replied to) and 'comment_like'
    (first like only; never for self-likes).
  - One notification per person per action. A post owner who is also
    the one replied to gets 'reply' only.
  - The replied-to person is excluded from the reply's @mention
    notifications (`notifyMentions` gained `excludeUserIds`); anyone
    else mentioned still gets 'mention'. The browser test caught this
    duplicate, and 2 API tests now lock the fix in.
  - The Notifications screen shows readable text for both new types.
- **UI:**
  - `CommentSection` renders threads with replies indented behind a
    guide line. Each comment has a meta row: time, heart + count,
    Reply, and Edit for your own.
  - The "Replying to @user" bar cancels with × or Esc. Likes are
    optimistic with rollback. A reply whose parent is hidden (block) is
    dropped rather than shown out of context.
- **Verified:**
  - 11 new API tests; backend 128/128.
  - B4 browser test 15/15 in headless Edge: like/unlike, reply nesting,
    reply-to-reply flattening (checked server-side), cancel via × and
    Esc, notification types and screen text, 375px dark with no h-scroll.
  - All earlier suites still green (A2, A3, B1, B2, B3); eslint and
    build clean.
- **Deploy order (owner):** migration 019 before this backend. See
  NEEDS OWNER.
- **Not done:** there's still no delete button for comments in the UI.
  The API exists and is owner-checked; I didn't add it here because it
  was outside this task.

### B5 — Post privacy: Public / Followers only
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** a `posts.visibility` column exists and every feed/profile
query respects it in addition to the existing account-level
private-account gating.
**Notes:**
- **Schema (migration 020):** `posts.visibility` 'public' | 'followers',
  default 'public', with a CHECK. Existing posts stay public. Verified:
  an old post defaults to public, invalid values are rejected, and down
  → up works.
- **Rule:** a post is visible to its author, to accepted followers, and
  to anyone else only when **both** the account is public **and** the
  post is public. Account privacy still wins: on a private account,
  "Public" posts are followers-only too.
- **Where it's enforced:**
  - Every listing predicate: discovery `GET /posts`, hashtag feed,
    search, and bookmarks. `NOT users.is_private` became
    `(NOT users.is_private AND posts.visibility = 'public')`.
  - The single-post rules: `getPost` and `postVisibilityService`. So
    likes, reactions, comments, comment likes, bookmarks and the
    comments/likes reads all follow it automatically.
  - `GET /feed` needed no change; it already only returns your own and
    accepted follows' posts.
  - A bookmark saved while a post was public disappears once the author
    restricts it.
- **API:**
  - `POST /posts` takes `visibility`.
  - `PUT /posts/:id` can change content and/or visibility (either
    alone).
  - Payloads include `visibility`.
- **Bug fixed along the way:** `PUT /posts/:id` with empty or missing
  content wrote NULL into a NOT NULL column and returned a 500. It's now
  a 400 with a message.
- **UI:**
  - Create Post has a "Who can see this?" control: native radios styled
    as pills, so arrow keys work.
  - Post headers show a globe (Public) or people (Followers) icon with a
    screen-reader label. This replaced a leftover mock that printed the
    raw value.
  - Owners switch audience from the post's ⋯ menu ("Make public" /
    "Make visible to followers only"). The change is optimistic, with
    rollback and an inline error.
- **Verified:**
  - 11 new API tests covering every surface above. I confirmed they fail
    when the rule is reverted. Backend 139/139.
  - B5 browser test 14/14: create Followers-only from the UI; a
    non-follower gets "Post not found" and no search hit; menu toggle to
    public and back; a new follower can see it; keyboard selection;
    375px dark.
  - All earlier suites still green; eslint and build clean.
- **Decision logged:** as with private accounts (A6 note), an @mention
  in a followers-only post still notifies the mentioned user even if
  they don't follow the author. The author chose to mention them.
- **Deploy order (owner):** migration 020 before this backend. See NEEDS
  OWNER.

### B6 — Profile tabs: Posts / Photos / Saved / Tagged
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** `ProfileScreen.jsx` has tabbed navigation, each tab backed
by a real filtered query. "Tagged" needs a scope decision (tagging people
in a post/photo isn't the same as an @mention in text — currently only
text mentions exist).
**Notes:**
- **Scope decision: Tagged = @mentioned.** The app has text @mentions,
  not photo tagging, so the Tagged tab shows *other people's* posts that
  @mention the user. That's real data today. The match uses the same
  word boundaries as mention parsing, is case-insensitive, and
  regex-escapes the username (usernames aren't restricted to word
  characters). It's passed as a bound SQL parameter. Photo tagging would
  be a separate feature.
- **API:** new `GET /users/:id/posts?tab=posts|photos|tagged&page&limit`
  (optionalAuth, paginated with `hasMore`).
  - **posts:** the user's own posts. **photos:** own posts that have
    images (post_media). **tagged:** as above.
  - Every row passes the same per-post visibility predicate as the feed:
    account privacy, B5 audience and blocks. A tab can never show a post
    the viewer couldn't open directly.
  - A private account → 403 "This account is private" for
    non-followers, the same pattern as the follower lists. Blocked or
    unknown → 404; a bad tab → 400.
  - **Saved** reuses the viewer's own `GET /bookmarks` and only appears
    on your own profile.
- **UI (`components/profile/ProfileTabs.jsx`):**
  - WAI-ARIA tabs with roving tabindex; ←/→/Home/End move between tabs.
  - Photos is a 3-column square grid with a count badge on multi-image
    posts; tapping opens the post. The other tabs show full PostCards
    with "Load more".
  - Separate loading, empty, error+retry and private states ("This
    account is private. Follow X to see their posts.").
  - Hook: `hooks/useProfileTabPosts.js`.
- **Decision:** the Settings profile row now opens **your own profile**
  (which has an Edit Profile button). Before, there was no way to reach
  your own profile page at all. "Personal Information" still goes
  straight to the edit form.
- **Verified:**
  - 7 new API tests (tab filtering, mention boundaries and case,
    audience, private 403, block/unknown 404, pagination). Backend
    146/146.
  - B6 browser test 13/13 in headless Edge: tab sets for other vs own
    profile, each tab's contents, keyboard navigation, photo → post,
    Settings row → own profile, Saved, empty state, private message,
    375px dark. 0 console errors.
  - All earlier suites still green; eslint and build clean.
- **No migration needed.**
- **Found, not fixed (outside B6, logged for A6/C4):** usernames
  accept any characters (spaces, symbols) at signup and edit. A username
  with non-word characters can't be @mentioned at all. Worth
  restricting to `[A-Za-z0-9_]`, but existing accounts need a policy
  first.

### B7 — Explore page: trending hashtags, popular posts
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** a ranking query (e.g. engagement over a recent time
window) backs a new `/explore` endpoint and screen.
**Notes:**
- **API** (optionalAuth; both look at the last 7 days):
  - `GET /explore/hashtags` returns the top 10 tags by number of distinct
    posts, with ties going to the most recently used. Decision: only
    **publicly visible** posts (public account, public post, active
    author) count toward trends, so a trend can't reveal activity in
    private or followers-only posts, not even as a number. Authors the
    viewer blocked are excluded.
  - `GET /explore/posts` ranks posts the viewer can see (the same
    visibility predicate as the feed) by engagement with time decay:
    `(reactions + 2×comments) / (hours_old + 2)^1.5`, Hacker-News-style
    gravity. Comments count double because they take more effort. Only
    posts with at least one reaction or comment qualify. Paginated.
- **UI:**
  - The new `/explore` screen (lazy) shows "Trending this week" chips,
    each linking to its hashtag feed, plus "Popular this week" as
    PostCards with Load more. It has loading, empty, error+retry states.
  - Decision: the entry point is the **Search screen**. Before you
    search, it shows the trending chips and an "Explore popular posts"
    link. The top bar is already full at 375px (the logo truncates), so
    a 5th icon wasn't an option.
- **Bug fixed along the way:** the top-bar Notifications bell had no
  onClick (a leftover "visual-only" stub), so it showed an unread badge
  but did nothing. It now opens /notifications, and its label includes
  the unread count.
- **Verified:**
  - 10 new API tests: ranking, 7-day window, comment weighting, time
    decay (a fresh 2-like post beats a 48h-old 3-like post), visibility,
    blocks, pagination, and trends ignoring private/followers-only posts
    even for their own author. Backend 156/156.
  - B7 browser test 7/7: bell → Notifications, trending chips on Search
    in the right order, chip → hashtag feed, Explore ranking, 375px dark.
  - The A3 visual matrix now also covers `/explore` and your own
    profile: 132/132. All earlier suites green; eslint and build clean.
- **No migration needed.** Performance is fine at MVP scale with the
  existing indexes. At real scale, pre-compute trending (for example a
  materialized view refreshed every few minutes) instead of scanning the
  7-day window per request.

### B8 — People you may know (follow suggestions)
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** a suggestion query (mutual follows / shared network) backs
an endpoint, surfaced in a real UI slot (e.g. on Explore or Search).
**Notes:**
- **API:** `GET /users/suggestions` (logged-in), up to 10 results.
  - **Network:** friends-of-friends (followed by the people you follow),
    ranked by mutual count, with a sample of up to 2 mutual usernames.
    Plus people who **follow you** but you haven't followed back, which
    get a +2 boost since it's a strong signal.
  - **Fallback:** the most-followed **public** accounts ("popular"), so a
    brand-new account still gets suggestions.
  - **Excluded:** you, anyone you follow or have a pending request to,
    blocks in either direction, and deactivated accounts. A private
    account is never used as a popular fallback.
  - **Privacy check:** mutuals come only from your *accepted* follows'
    following lists, which A6's list rules already let you see. Nothing
    new is revealed.
- **UI (`components/explore/PeopleYouMayKnow.jsx`):**
  - A horizontal, snap-scrolling row of cards: avatar and name link to
    the profile, a plain-language reason ("Followed by X and Y",
    "Followed by X and 2 others", "Follows you", "Popular · N
    followers"), and a Follow button.
  - Shown on Explore (top) and on Search before a query. Hidden when
    empty or on error, since it's a discovery aid.
- **Bug fixed along the way:** `useFollowToggle` ignored the server's
  `status`, so following a **private** account showed "Following" while
  it was really a pending request. This affected Search results before
  B8 too. The hook now tracks `requested`, and the shared `FollowButton`
  says "Requested".
- **Verified:**
  - 6 new API tests: ranking and mutual sample, follows-you boost, every
    exclusion (deactivation confirmed via the real password flow),
    popular fallback excluding private accounts, network before popular
    with no duplicates. Backend 162/162.
  - B8 browser test 10/10: order and reasons, follow → "Following"
    (checked server-side), follow private → "Requested" (pending checked
    server-side), card → profile, followed people drop off Search's
    list, 375px dark with no page scroll.
  - All earlier suites green (A3 matrix 132/132); eslint and build
    clean.
- **No migration needed.**
- **Not done:** no "dismiss this suggestion" action (it would need
  persisted dismissals). Suggestions are computed per request; at scale,
  cache them per user.

### B9 — DM extras: edit/delete message, reply-to, send images
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** each sub-feature has DB + API support and UI controls in
`Conversation.jsx`. Note: soft-delete for messages already exists
(confirmed 2026-09-23) — verify what's reusable before building delete
again; edit and reply-to are net-new.
**Notes:**
- **CHECK result: PARTIAL.** Delete (soft delete over socket and REST,
  with UI) already existed and was reused; I audited it rather than
  rebuilding it. `messages.edited_at` existed but was never written.
  Reply-to and images were net-new.
- **Schema:** two migrations, on purpose. 021 adds the `image` value to
  `message_type`. 022 adds `reply_to_message_id` (ON DELETE SET NULL)
  and extends the CHECK for image rows.
  - Why two: Postgres can't use a new enum value inside the transaction
    that adds it, and the runner sends each file as one transaction.
  - 021's DOWN is a documented no-op (Postgres can't drop an enum
    value). 022's DOWN deletes image messages, then restores the old
    constraint.
  - Verified up/down/up on a pre-021 DB with real rows.
- **Edit:** your own **text** messages only, not deleted, within **15
  minutes** of sending (decision: Messenger/WhatsApp-style, long enough
  to fix a typo without letting history be rewritten later). Sets
  `edited_at`, so bubbles show "edited".
  - Available over the socket (`edit_message`, broadcasting
    `message_edited`) and REST (`PUT .../messages/:id`).
  - The Edit button hides itself exactly when the window closes (a
    timer, not render-time clock reads).
- **Reply-to:** the target must be in the **same conversation**, so a
  reply can't quote a message from a chat you're not in.
  - Every message carries a `reply_to` preview (author, type, first 120
    characters). These are batched in one query per page, and a deleted
    original shows as "Message deleted".
  - Quotes already on screen update live when the original is edited or
    deleted, and a retried failed reply stays a reply.
- **Images:** `POST .../messages/image` (optional caption). The
  participant check runs **before** the upload, so a non-participant
  can't put a file on Cloudinary.
  - The UI sends optimistically from a local preview, shows upload
    progress, and offers Retry on failure. Tapping a photo opens it full
    size.
- **Audit fix (privacy):** a **deleted voice message still sent its
  audio URL and duration** to both participants, so it stayed playable.
  Deleted rows now scrub media too (`media_url`, `duration_seconds`),
  which also covers images.
- **Also fixed:**
  - The inbox preview was blank for voice messages and would have been
    blank for photos. It now says "Voice message" / "Photo" / "Photo:
    caption", in both the SQL and the live socket update.
  - After adding the photo button, the composer wrapped Send onto a
    second line at 375px. The input now shrinks instead; checked at 320,
    375 and 390px.
- **Verified:**
  - 11 new API tests: every edit rejection including the 15-minute
    window, the reply preview, the cross-conversation rejection, image
    send, non-participant refused before upload, and the voice-scrub
    fix. Backend 171/171; the existing A1 DM test caught my own inbox
    SQL slip immediately.
  - B9 browser test 15/15 with real sockets: live receive, reply bar →
    quoted bubble (checked server-side), inline edit + Esc, the other
    user's edit updating bubble and quote live, a deleted original
    showing "Message deleted", failed photo → Retry → one image.
  - All earlier suites still green; eslint and build clean.
- **Deploy order (owner):** migrations 021 then 022 before this backend.
  See NEEDS OWNER.

### B10 — Group chat
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** conversations reliably support more than 2 participants,
plus group-specific UI (name, member list, add/remove member).
**Notes:**
- **CHECK result: PARTIAL, as the note predicted.** `conversation_type`
  already had 'group' and `conversation_participants` was a real
  many-to-many table. Groups still lacked a name, roles, an API, inbox
  rows and UI, and several code paths assumed "the other participant".
- **Schema (migration 023):** `conversations.name` (required for groups
  via a CHECK) and `created_by`, plus `conversation_participants.role`
  (admin/member, default member). Verified: existing direct chats
  untouched, an unnamed group rejected, down removes groups and keeps
  direct chats, then up again.
- **API** (`controllers/groupController.js`):
  - `POST /conversations/groups` creates the group (conversation and
    participants in one statement). The creator becomes admin.
  - `GET /conversations/:id` returns details and members; it also works
    for direct chats.
  - `PATCH /conversations/:id` renames (admins only).
  - `POST /conversations/:id/members` adds people (admins only).
  - `DELETE /conversations/:id/members/:userId` removes someone (admins)
    or lets you leave.
- **Decisions:**
  - At most 50 members. You can't add blocked (either direction) or
    deactivated users.
  - **A block between two members doesn't silence the group**
    (WhatsApp-style); blocked pairs just can't be put together.
  - The last admin leaving promotes the longest-standing member, and
    the last member leaving deletes the group.
  - **No delivered/read ticks in groups:** one status field can't
    describe many readers, so group messages stay 'sent'. Unread counts
    still work per member.
- **Realtime:**
  - Each socket now joins a personal `user_<id>` room on connect, so
    add/remove moves live sockets into and out of the group room without
    a reconnect.
  - A `group_updated` event refreshes open chats and info screens.
  - Someone removed by an admin is notified; someone who leaves
    voluntarily isn't. That was a fix: notifying yourself caused a
    needless 403 refetch.
- **Inbox:** groups are listed alongside direct chats, with the group
  name, member count and a sender-prefixed preview ("alice: hi", "You:
  hello!"). They're ordered by latest activity, with a fix to preserve
  the old ordering for empty chats.
- **UI:**
  - A "New group" button on Messages leads to `/messages/new-group`
    (name plus a picker over the people you follow, with a filter and
    native checkboxes).
  - The chat header shows the group glyph, name and "N members", and
    taps through to `/messages/:id/info`.
  - Group info shows members and roles; admins can rename, add (existing
    members shown as "In group") and remove, with confirmation; anyone
    can leave, with confirmation.
  - Bubbles show the sender's name; reply quotes and "X is typing" use
    member names.
  - If you've been removed while a chat is open, it shows "You're no
    longer in this conversation".
- **Verified:**
  - 13 new API tests: create and its validation, the 50 cap on create
    and add (with 50 real users so the *cap* is what rejects), messaging
    and non-member refusal, a block not silencing the group, no
    misleading ticks, per-member unread counts, inbox rows, admin-only
    actions, removal revoking access, admin handover, deletion on last
    leave, rename, direct chats refused by group endpoints. Backend
    184/184.
  - B10 browser test 14/14, stable across 3 consecutive runs, 0 console
    errors: create from the UI, live messages with sender names, info,
    rename, remove → 403, picker re-add, a live update while another
    member leaves, inbox row, leave → handover, 375px dark.
  - The A3 matrix now includes `/messages/new-group`: 138/138. All
    earlier suites green; eslint and build clean.
- **Deploy order (owner):** migration 023 before this backend. See NEEDS
  OWNER.
- **Not done:**
  - No system messages in the thread ("alice added bob").
  - No group avatar upload (a group glyph is shown instead).
  - No per-member read receipts.

### B11 — Notification settings (choose which to receive)
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** a per-user preferences table/column exists, notification-
creation code checks it before inserting each notification type, and a
Settings UI toggle controls it (row already exists as a stub —
`SettingsScreen.jsx`'s "Content Preferences"/notifications area).
**Notes:**
- **Schema (migration 024):** `notification_preferences` has one row per
  user, with a boolean per category. **No row means everything on**, so
  existing users need no backfill and keep every notification.
  Verified: defaults, cascade on account deletion, down/up.
- **Decision: categories, not raw types.** Five switches that match how
  people think about it:
  - likes & reactions (`like`, `comment_like`);
  - comments & replies (`comment`, `reply`);
  - mentions;
  - new followers (`follow`, `follow_request`);
  - accepted requests (`follow_accepted`).
  The type → category map lives in `services/notificationService.js`.
- **The real change:** notifications used to be created by raw
  `INSERT`s scattered across 7 controller sites. Now there's one
  `notificationService.notify()` that checks the preference and inserts
  in a single statement (nobody is ever notified about their own
  actions). The batched mention insert uses the same `allowedSql()`
  filter. A future notification type can't accidentally skip settings.
- **API:** `GET` / `PUT /notification-preferences`. PUT is partial and
  validated: known keys only, booleans only.
- **UI:** a new Settings row, "Notification Settings", opens
  `/settings/notifications`.
  - Five switches, reusing the app's switch style, each with a
    one-line description linked via `aria-describedby`.
  - Changes are optimistic with revert and an inline error.
  - The screen explains that turning something off won't remove
    notifications you already have.
- **Verified:**
  - 7 new API tests: each switch silences exactly its types and nothing
    else (mentions through the batched path, with another user still
    getting theirs), defaults, partial updates, validation, turning back
    on resumes, and existing notifications are never deleted. Backend
    191/191.
  - B11 browser test 9/9: Settings → screen, all on by default, click
    off (checked server-side), end to end (Bob's like silent, his
    comment delivered), persists across reload, Space toggles a focused
    switch, accessible descriptions, 375px dark.
  - The A3 matrix now includes this screen: 144/144. All earlier suites
    green; eslint and build clean.
- **Deploy order (owner):** migration 024 before this backend. See NEEDS
  OWNER.
- **Not done:** web push notifications (still a NEEDS OWNER item for the
  VAPID keys). These settings will apply to push too once it exists,
  since everything goes through `notify()`.

### B12 — Admin panel: review reports, ban users, remove posts
**Status:** ✅ VERIFIED (2026-09-26)
**Done when:** an admin-only route group + role/flag on `users` exists;
a UI (can be minimal) lists the `reports` table (already populated by
real user reports since the 12-feature batch, currently reviewed by
nobody — confirmed 2026-09-23) and supports acting on them (dismiss,
remove content, ban).
**Notes:**
- **Schema (migration 025):** `users.is_admin`, `banned_at`, `ban_reason`;
  `reports.resolved_by`, `resolved_at`, `resolution`
  (dismissed / content_removed / user_banned). Verified: existing users
  and reports unaffected, invalid resolution rejected, down/up.
- **Who's an admin (decision):** there is **no API or UI to grant admin**,
  so nobody can promote themselves. `node scripts/make-admin.js
  <username>` (or `--revoke`) sets it; that's an owner step, see NEEDS
  OWNER. `requireAdmin` re-reads the flag from the DB on every request,
  so revoking takes effect immediately. Non-admins get **404** from the
  admin API, so it doesn't advertise itself.
- **Moderation API:**
  - `GET /admin/reports?status=pending|reviewed` returns target
    summaries (post text and author, or the reported account) plus how
    many pending reports share that target.
  - Actions: dismiss, remove-content (posts only), `POST
    /admin/users/:id/ban` (optional reason) and `/unban`.
  - **Acting on one report resolves every pending report on the same
    target**: five reports on one post is one decision. Each records
    who, when and the outcome.
  - A ban also resolves pending reports about that user's posts.
- **Ban design (decision):**
  - A ban also sets `is_deactivated`, so every existing visibility rule
    hides the user's posts, profile and comments with no query changes.
  - Login refuses a banned account (403) **before** the auto-reactivation
    that deactivated accounts get.
  - Existing sessions end immediately: `authMiddleware` returns 401,
    which the frontend already turns into a logout. `optionalAuth`
    treats the user as anonymous, `socketAuth` refuses the connection,
    and live sockets are disconnected.
  - You can't ban yourself or another admin. Unban restores everything.
  - Cost: one PK lookup per authenticated request (noted in
    `accountStatusService`).
- **Bug fixed along the way (app-wide):** under Express 5, `req.body` is
  `undefined` when a request has no body. Every handler that reads or
  destructures it crashed with a 500 instead of its own 400; the first
  one found was banning without a reason. `req.body` now defaults to
  `{}` globally, with regression tests for both cases.
- **UI:**
  - `/admin` ("Moderation") has Pending (oldest first) and Reviewed
    (outcome, who, when) tabs.
  - Report cards show a target preview with links, a "N reports" badge,
    and Dismiss / Remove post / Ban (optional reason typed inline before
    confirming) / Unban.
  - An admin-only "Admin → Moderation" section appears in Settings; a
    non-admin opening `/admin` sees "Not found".
- **Verified:**
  - 12 new API tests: 404 for non-admins, `is_admin` on the profile,
    listing and counts, dismiss/remove resolving the whole target,
    remove refused for user reports, ban hiding content + blocking
    login + killing old tokens + anonymous browsing, reason optional,
    no self/admin bans, unban, immediate revoke, and the body-less
    request regression. Backend 203/203.
  - B12 browser test 13/13, including a banned user's **already-open
    session being sent to the login page**.
  - The A3 matrix now includes `/admin` (as an admin): 150/150. All
    other suites green.
- **Test-infra notes:**
  - One full run hit `ERR_INTERNET_DISCONNECTED`: this machine briefly
    lost internet, and the only external request is the Google Fonts
    stylesheet. The affected suites were rerun clean.
  - Fixed a flaky Explore test that sometimes counted the loading
    skeleton, which also carries the `post-card` class. It now targets
    `article.post-card`; 5/5 runs pass.
- **Deploy order (owner):** migration 025 before this backend, then
  promote your own account with `scripts/make-admin.js`. See NEEDS
  OWNER.
- **Not done:** no audit log beyond each report's resolution fields, no
  temporary (timed) bans, and no bulk actions.

### B13 — Groups (create, join, post inside, admins)
**Status:** ✅ VERIFIED (2026-09-27)
**Done when:** `groups`/`group_members` tables exist, posts can be scoped
to a group, group-admin permissions enforced.
**Notes:**
- **Naming (autonomous choice):** the tables are `communities` and
  `community_members`, because "group" already means B10 group chats
  (`conversations.is_group`). The UI still calls them "Groups".
- **Schema (migration 026):** `communities` (name, description, privacy
  public|private, created_by) and `community_members` (role admin|member,
  status member|pending). `posts.community_id` is nullable, with
  `ON DELETE CASCADE` and a partial index.
- **Rules:**
  - Public groups can be read by anyone and joined instantly.
  - Private groups are listed and searchable, but only members see
    posts. Joining creates a request that an admin approves.
  - Switching a group to public admits everyone pending.
  - Only members can post. Group admins can delete any post in the group
    and manage members and roles.
  - If the last admin leaves, the oldest member is promoted. If the last
    member leaves, the group is deleted.
  - Group posts never appear in Home, profile, search, hashtag, explore
    or trending listings. Bookmarks and `/posts/:id` go through
    `postVisibilityService`, so saved group posts stay private to members.
  - The Public/Followers audience is hidden for group posts.
- **Frontend:**
  - Menu → Groups (`/groups`: your groups, discover, search) and
    `/groups/new`.
  - `/groups/:id`: the group feed, Join/Request/Leave, and "Write a
    post", which opens the composer with `?communityId`.
  - `/groups/:id/manage`: details, requests, members and roles.
  - The PostCard menu shows "Delete post (group admin)" to group admins.
- **Verified:**
  - Backend 217/217 (14 new community tests).
  - B13 browser test 22/22, covering create, post, discover, request,
    approve, admin delete, promote, make public, leave, search, 404 and
    375px dark layouts.
  - A3 matrix 174/174, with the 4 group routes added.
  - Every earlier browser suite (A2, B1–B12) is green.
  - Migration 026 up/down/up verified on a throwaway DB.
- **Fix found by A3:** the `--badge-*` colors aren't dark-adapted, so
  large group icons now use `--color-subtle-bg` / `--color-accent-2`.
- **Deploy order (owner):** migration 026 after 025, before this backend.
  See NEEDS OWNER.
- **Not done:** group cover images, group notifications (join request or
  new post), invite links, and pinned posts.

### B14 — Pages (business/creator pages, follow pages)
**Status:** 🟡 PARTIAL (backend done 2026-09-27: migration 027, /pages API, post-as-page, 14 tests, suite 231/231; frontend screens + browser tests remain)
**Done when:** a page entity distinct from a user account exists, a
follow-a-page flow, and page-authored posts.
**Notes:** _(none yet)_

### B15 — Myanmar / English language switch (i18n)
**Status:** ⬜ NOT CHECKED
**Done when:** an i18n library is wired into the frontend, all
user-facing strings are extracted (currently all hardcoded English), and
a language toggle in Settings persists the choice.
**Notes:** _(none yet)_

---

## SECTION C — Investor prep

### C1 — Demo seed script
**Status:** ⬜ NOT CHECKED
**Done when:** a single command (e.g. `npm run seed`) populates a local
dev database with realistic users, posts, comments, follows, and DMs;
clearly separated from the real migration scripts; safe to re-run.
**Notes:** local DB only, per your scope note.

### C2 — Privacy Policy + Terms pages (draft)
**Status:** ⬜ NOT CHECKED
**Done when:** two real routes/screens exist with actual (simple/
template is fine) legal text, linked from the existing disabled stub
rows in `SettingsScreen.jsx` ("Terms & Conditions", "Privacy Policy" —
confirmed present but non-functional as of 2026-09-23).
**Notes:** _(none yet)_

### C3 — Landing page explaining the app
**Status:** ⬜ NOT CHECKED
**Done when:** a public marketing/explainer page exists, separate from
the logged-in app shell, for someone who isn't a user yet.
**Notes:** _(none yet)_

### C4 — Final end-to-end audit of every feature + report
**Status:** ⬜ NOT CHECKED
**Done when:** every item in this roadmap re-verified against the actual
running app in one pass, with a written pass/fail report per item.
**Notes:** this is the gate before investor demo — do last.

---

## NEEDS OWNER (Claude must skip these — require your own account/action)

- Email via Brevo API — needs a Brevo account + API key; Render blocks
  outbound SMTP on its free tier, so Gmail SMTP (Phase 2) only works for
  local dev, not the deployed backend.
- Web push notifications — needs VAPID/push env keys configured on Render.
- Voice/Video calls — needs two-device testing, can't be verified solo.
- Short/Long video — Cloudinary free-tier credits risk; needs a budget
  decision before building.
- Real multi-user testing, deployment verification — needs you actually
  doing it, not something to automate away.
- Merging dev into main — a deliberate action only you should trigger.
- A4 CI first run: `git push -u origin dev`, then open the repo's Actions
  tab (or a PR from dev → master) and confirm both CI jobs go green. If
  they do, mark A4 ✅. (Not pushed by Claude: pushing publishes code, and
  the standing instruction was to commit to dev.)
- A5 keep-alive: after merging dev → master, open Actions → Keep-alive →
  "Run workflow" once to confirm it goes green. Then, after an idle stretch
  of 30+ min, check that a visit to the site loads quickly (no ~20s cold
  start) and that the run logs show sub-second times. If so, mark A5 ✅.
- A6 migration 015 on production: back up first, then run
  `node scripts/run-migration.js migrations/015_add_fk_lookup_indexes.up.sql`
  from `backend/` with the real DATABASE_URL. It's idempotent (IF NOT
  EXISTS), and `015_...down.sql` reverts it. (Claude never touches the
  production DB.)
- B1 migration 016 on production, **before deploying the new backend**
  (the post queries select `likes.reaction` and would fail without it):
  `node scripts/run-migration.js migrations/016_add_reactions.up.sql`.
  Existing likes become "like" reactions automatically.
- B2 migration 017 on production, **before deploying the new backend**:
  `node scripts/run-migration.js migrations/017_add_post_media.up.sql`
  (backfills existing single-image posts).
- B3 migration 018 on production, **before deploying the new backend**:
  `node scripts/run-migration.js migrations/018_add_stories.up.sql`.
  Run all pending migrations in order: 015 → 016 → 017 → 018 → 019 → 020 → 021 → 022 → 023 → 024 → 025 → 026.
- B4 migration 019 on production, **before deploying the new backend**:
  `node scripts/run-migration.js migrations/019_add_comment_replies_likes.up.sql`.
- B5 migration 020 on production, **before deploying the new backend**:
  `node scripts/run-migration.js migrations/020_add_post_visibility.up.sql`.
- B9 migrations 021 **then** 022 on production, before deploying the new
  backend (021 must be its own run -- see its header comment).
- B10 migration 023 on production, before deploying the new backend:
  `node scripts/run-migration.js migrations/023_add_group_chats.up.sql`.
- B11 migration 024 on production, before deploying the new backend:
  `node scripts/run-migration.js migrations/024_add_notification_preferences.up.sql`.
- B12 migration 025 on production, before deploying the new backend:
  `node scripts/run-migration.js migrations/025_add_admin_moderation.up.sql`.
  Then make yourself an admin (no UI can do this, by design):
  `node scripts/make-admin.js <your username>` -- Settings then shows
  Admin → Moderation.
- B13 migration 026 on production, before deploying the new backend:
  `node scripts/run-migration.js migrations/026_add_communities.up.sql`.
