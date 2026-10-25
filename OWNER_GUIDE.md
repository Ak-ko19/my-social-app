# MySocialApp — Owner's guide

This guide is for you, the owner. It uses simple words. It explains:

1. what the app can do,
2. how to open it on your own computer,
3. how to show it to someone (a short demo),
4. how to check that everything works,
5. what only you can do (accounts and keys), and what each one turns on,
6. how to put it online,
7. what to build after you get funding.

Other documents, if you want more detail:

- `README.md` — for developers: how the code is organised.
- `GO_LIVE_CHECKLIST.md` — every step to put the app online.
- `LATER.md` — every task that only you can do, step by step.
- `MONTH_PLAN.md` — the plan, and a diary of what was built each day.

---

## 1. What the app can do

MySocialApp works like Facebook. Everything below works today.

**Accounts and safety**
- Sign up, log in, change or reset your password, delete your account.
- Download a copy of all your data.
- See every device that is logged in, and log any of them out.
- "New login" alerts when your account is used on a new kind of device.
- Two-factor login with an authenticator app (Google Authenticator and
  others), with recovery codes.
- Protection against bots and password guessing.

**Posting and reading**
- Posts with text, photos and polls. Choose who sees each post: everyone,
  followers, close friends, or only you.
- Drafts, and posts scheduled for later.
- Reactions (like, love, haha...), comments, replies, and comment likes.
- Stories that disappear after 24 hours.
- Hashtags, @mentions, search, Explore (trending and popular posts).
- Saved posts, sorted into your own collections.
- Memories: your posts from this day in earlier years.

**People**
- Follow, private accounts with follow requests, friends.
- "People you may know".
- Block, mute, restrict, hide offensive words.

**Messages**
- Private and group chats, live. Typing and "seen".
- Voice notes, photos, replies, reactions, edit, unsend, forward.
- A message written offline is sent when the internet comes back.

**Communities**
- Groups, pages and events.

**Notifications**
- Grouped like Facebook ("Ana, Ben and 3 others liked your post").
- Tabs: All, Unread, Mentions, Follows. The bell updates live.
- Phone and computer notifications (web push) — needs push keys, see
  section 5.
- You choose which kinds you get.

**For you, the admin**
- Reports from users, and tools to remove content, ban or suspend people.
  The person is told when their content is removed.
- An error log, storage use, statistics, and a log of every admin action.

**Quality**
- English and Arabic. In Arabic the whole app reads right to left.
- Light and dark mode. Works on phones and computers.
- It can be installed like an app (PWA).
- New users get a short "Get started" guide.
- More than 1,000 automatic backend tests and about 80 browser test
  suites check the app.

---

## 2. Open the app on your computer

You need, once:

- **Node.js 24** — https://nodejs.org
- **PostgreSQL 17** — https://www.postgresql.org/download/windows/
- **Git for Windows** (it gives you "Git Bash") — https://git-scm.com

Open **Git Bash** and type these commands, one block at a time.

**Step 1 — make the database (only the first time)**

```bash
cd /c/MyProjects/Mysocialapp
createdb mysocialapp
psql -d mysocialapp -f backend/tests/fixtures/schema.sql
```

**Step 2 — start the server (the "backend")**

```bash
cd /c/MyProjects/Mysocialapp/backend
npm install
node server.js
```

The first time, copy `backend/.env.example` to `backend/.env` and fill in
`DATABASE_URL` and `JWT_SECRET` (the file explains both). Leave this
window open.

**Step 3 — start the website (the "frontend")** — in a second Git Bash
window:

```bash
cd /c/MyProjects/Mysocialapp/frontend
npm install
npm run dev
```

Now open **http://localhost:5173** in your browser.

**Step 4 — add demo content (optional, good for showing people)**

```bash
cd /c/MyProjects/Mysocialapp/backend
npm run seed:demo
```

This adds 12 people with posts, chats, groups and a page. Log in as
`thiri@demo.mysocialapp.test` with the password `demo-password-123`.
Thiri is an admin. Every other demo person works the same way
(`<name>@demo.mysocialapp.test`). The seed refuses to run on the live
database, so it is safe.

**To make someone an admin:** `node scripts/make-admin.js <username>` (in
`backend/`). There is no button for this on purpose.

---

## 3. A five-minute demo (for investors)

With the demo content from step 4, log in as Thiri on a phone-sized window
(or a phone on the same Wi-Fi) and show:

1. **Home** — posts with photos, reactions, "12 comments" on each card,
   stories at the top, and "On this day" when there are memories.
2. **A post** — react, comment, reply. Open the comments.
3. **Messages** — open the group chat. Send a voice note or a photo.
   Open the same chat as another demo person in a second browser: the
   message arrives at once.
4. **Notifications** — grouped rows and tabs.
5. **Arabic** — Settings → Language → العربية. The whole app turns right
   to left.
6. **Dark mode** — the switch in Settings.
7. **Safety** — Settings → Two-factor authentication, and Where you're
   logged in.
8. **Admin** — Settings → Moderation: reports, statistics, error log.

---

## 4. Check that everything works

These commands run the automatic tests. Green ("passed") means good.

```bash
cd /c/MyProjects/Mysocialapp/backend && npm test        # about 1,000 API tests, ~10 minutes
cd /c/MyProjects/Mysocialapp/frontend && npm test       # about 370 screen tests, ~2 minutes
```

Browser tests (they open a hidden browser and click through the app). Run
a few at a time — your computer has 8 GB of memory:

```bash
cd /c/MyProjects/Mysocialapp/e2e
npm install
E2E_ONLY="journeys-core journeys-safety" bash run-all.sh
```

GitHub also runs the main tests on every change (the "CI" tab — see
LATER.md item 1).

---

## 5. What only you can do — and what it turns on

The app works without these. Each one switches on more. They are free.
`LATER.md` has the exact clicks for each.

| LATER.md item | What it turns on | Cost | Time |
| --- | --- | --- | --- |
| 1. Check CI on GitHub | You see the automatic tests run on GitHub | Free (2,000 minutes/month) | 2 min |
| 2. GO LIVE (merge and deploy) | The new app on the internet for everyone | Free plans (Render, Vercel, Neon) | 1–2 hours, once |
| 3. Brevo email key | Real emails: password reset, email check, login alerts, 2FA changes | Free (300 emails/day) | 10 min |
| 4. Daily cleanup | Old stories, notifications and sessions are deleted, so the free database (0.5 GB) does not fill up. The Privacy Policy promises this | Free | 5 min |
| 5. Sentry (optional) | Errors also go to Sentry. The app already has its own error log | Free plan | 10 min |
| 6. Turnstile (optional) | A "are you human?" check at sign-up | Free | 10 min |
| 7. Push keys (optional) | Notifications on phones and computers, even with the app closed | Free, no account | 2 min |
| 8. Old Myanmar (Zawgyi) text | Old posts written in Zawgyi become readable Unicode | Free | 5 min |

Without them: no emails (the app says so politely), no push, no human
check. Nobody is locked out.

---

## 6. Put the app online (GO LIVE)

Claude Code is not allowed to touch the live website or the live database
(you set this rule in `CLAUDE.md`). So going live is your job. It is a
checklist, step by step: **`GO_LIVE_CHECKLIST.md`**. In short:

1. Make a backup of the live database (the checklist shows how).
2. Run the database changes ("migrations"), in the given order.
3. Check the settings on Render (the server) and Vercel (the website).
4. Merge `dev` into `master`. Render and Vercel update themselves.
5. Test the live site with the list in the checklist.
6. If something is wrong: the checklist has a "go back" plan.

Before you start, a test run of all the database changes on a copy:
`cd e2e && bash golive-rehearsal.sh --old` (it must say "REHEARSAL
PASSED").

**Free-plan limits to know:** the Render server sleeps after 15 minutes
without visitors, and the first visit then takes about 20 seconds. A
keep-alive job prevents this once `master` has the new code. The Neon
database has 0.5 GB (turn on the daily cleanup, item 4).

---

## 7. After funding

These work today, but should change when there is money and many users:

- **A paid server and database** — no sleeping, more memory, backups
  every day.
- **Redis** — today the limits against spam and password guessing are
  kept in each server's memory. With several servers they should be
  shared in Redis.
- **Encrypt the two-factor keys** — they need a secret key that you keep
  safe. Today they are stored as they are.
- **Login in a secure cookie** instead of the browser's local storage
  (the site's security rules make this low risk today).
- **Explore at scale** — "popular this week" is worked out on each visit;
  with many users it should be prepared in advance.
- **The mobile app** (React Native) — the server is ready for it; only the
  screens need building.
- **Paused on purpose:** videos, reels, live streaming and calls.

---

## Where to look when something goes wrong

- **In the app:** Settings → Moderation → Errors (every server and browser
  error, grouped, with counts).
- **On Render:** the backend service → Logs.
- **In a new Claude Code session:** paste what you see. `WIP.md` always
  shows where the last session stopped.
