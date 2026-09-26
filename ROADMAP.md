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
**Status:** ⬜ NOT CHECKED
**Done when:** a `stories` table with `expires_at`, an upload endpoint,
expiry enforced (query-time filter or cron cleanup), and `StoriesRow.jsx`
(left intact in Phase 1 specifically for this) wired to the real data
instead of removed entirely.
**Notes:** _(none yet)_

### B4 — Comment replies (nested) + comment likes
**Status:** ⬜ NOT CHECKED
**Done when:** `comments.parent_comment_id` added (schema is currently
flat, confirmed 2026-09-23), threaded reply UI, `comment_likes` table +
like button on comments.
**Notes:** _(none yet)_

### B5 — Post privacy: Public / Followers only
**Status:** ⬜ NOT CHECKED
**Done when:** a `posts.visibility` column exists and every feed/profile
query respects it in addition to the existing account-level
private-account gating.
**Notes:** _(none yet)_

### B6 — Profile tabs: Posts / Photos / Saved / Tagged
**Status:** ⬜ NOT CHECKED
**Done when:** `ProfileScreen.jsx` has tabbed navigation, each tab backed
by a real filtered query. "Tagged" needs a scope decision (tagging people
in a post/photo isn't the same as an @mention in text — currently only
text mentions exist).
**Notes:** _(none yet)_

### B7 — Explore page: trending hashtags, popular posts
**Status:** ⬜ NOT CHECKED
**Done when:** a ranking query (e.g. engagement over a recent time
window) backs a new `/explore` endpoint and screen.
**Notes:** _(none yet)_

### B8 — People you may know (follow suggestions)
**Status:** ⬜ NOT CHECKED
**Done when:** a suggestion query (mutual follows / shared network) backs
an endpoint, surfaced in a real UI slot (e.g. on Explore or Search).
**Notes:** _(none yet)_

### B9 — DM extras: edit/delete message, reply-to, send images
**Status:** ⬜ NOT CHECKED
**Done when:** each sub-feature has DB + API support and UI controls in
`Conversation.jsx`. Note: soft-delete for messages already exists
(confirmed 2026-09-23) — verify what's reusable before building delete
again; edit and reply-to are net-new.
**Notes:** _(none yet)_

### B10 — Group chat
**Status:** ⬜ NOT CHECKED
**Done when:** conversations reliably support more than 2 participants,
plus group-specific UI (name, member list, add/remove member).
**Notes:** the existing `conversation_participants` join-table design
(confirmed via FK audit 2026-09-23) may already be structurally
multi-participant-capable — verify before assuming new schema work is
needed here.

### B11 — Notification settings (choose which to receive)
**Status:** ⬜ NOT CHECKED
**Done when:** a per-user preferences table/column exists, notification-
creation code checks it before inserting each notification type, and a
Settings UI toggle controls it (row already exists as a stub —
`SettingsScreen.jsx`'s "Content Preferences"/notifications area).
**Notes:** _(none yet)_

### B12 — Admin panel: review reports, ban users, remove posts
**Status:** ⬜ NOT CHECKED
**Done when:** an admin-only route group + role/flag on `users` exists;
a UI (can be minimal) lists the `reports` table (already populated by
real user reports since the 12-feature batch, currently reviewed by
nobody — confirmed 2026-09-23) and supports acting on them (dismiss,
remove content, ban).
**Notes:** _(none yet)_

### B13 — Groups (create, join, post inside, admins)
**Status:** ⬜ NOT CHECKED
**Done when:** `groups`/`group_members` tables exist, posts can be scoped
to a group, group-admin permissions enforced.
**Notes:** _(none yet)_

### B14 — Pages (business/creator pages, follow pages)
**Status:** ⬜ NOT CHECKED
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
  (backfills existing single-image posts). Run 015 → 016 → 017 in order.
