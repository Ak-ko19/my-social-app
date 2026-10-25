# MySocialApp Project

## Top rule (owner, 2026-10-25)
NEVER end your turn while any shell or test is still running. Run every test and command in the FOREGROUND with a long timeout and wait for it to finish. Never say 'waiting for X' and stop. After each step's report, immediately start the next step. The ONLY time you stop is when the owner presses Esc.

## Tech Stack
- Backend: Node.js + Express
- Frontend: React + Vite
- Database: PostgreSQL
- OS: Windows, Editor: VS Code
- Location: C:\MyProjects\Mysocialapp (backend/ and frontend/ subfolders)
- UI languages: English and Arabic ONLY (EN/AR, with full RTL in Arabic).
  Owner decision 2026-10-07: Myanmar was removed as a UI language. Every
  new feature ships fully translated in both, with correct RTL in Arabic
  (`npm run check:i18n` enforces it). User content (posts, comments,
  messages, search) stays open to ANY language, Burmese included.

- API reference: backend/docs/openapi (served at GET /docs and
  GET /openapi.json; real-time events in backend/docs/REALTIME.md). Every
  route must be documented, and every API test's responses must match it
  (tests/api/openapiSpec.test.js, tests/helpers/contract.js).

## Project Goal
Building a Facebook-style, large-scale social media platform. Plan: build a
budget-friendly MVP/prototype first (no significant startup capital yet),
then pitch to investors using the working prototype, then use funding to
build scalable infrastructure, then do a full public launch.

Near-term: web app (React). Native app (React Native) comes later once
funded — backend API is device-agnostic and won't need rewriting.

No investor deadline pressure — building thoroughly, roughly a month timeline
rather than rushing.

## Completed Features
(Updated Day 88. Details: PROJECT_DETAILED_GUIDE.md and MONTH_PLAN.md's
Progress Log; how to run and test everything: README.md; for the owner in
simple English: OWNER_GUIDE.md.)

- **Accounts:** signup / login (JWT sessions you can see and sign out),
  email verification and password reset (Brevo or SMTP; off without a
  provider), change password, deactivate, delete, download your data, bot
  protection (honeypot, form timing, optional Turnstile), rate limits,
  "new login" alerts for a new kind of device, two-factor authentication
  with an authenticator app (QR setup, recovery codes, a login code step).
- **Social:** posts with photos, polls, audiences (public / followers /
  close friends / only me), drafts and scheduled posts, hashtags and
  mentions, reactions, threaded comments (paged), saved collections,
  stories, follows and follow requests (private accounts), friends, people
  you may know, Explore, ranked search, profiles (links, cover, pinned post),
  first-run steps for new accounts (language, photo, people to follow, tour).
  Memories ("On this day" on Home, a morning reminder in your own time zone).
- **Chat:** direct and group chats over Socket.IO (live, typing, presence,
  read receipts), voice notes, photos, replies, edits, unsend, reactions,
  forwarding; paged inbox and history.
- **Groups, pages, events;** notifications (grouped like Facebook's, tabs,
  live badge, per-type settings, web push, "we removed your post").
- **Safety:** block, mute, restrict, hidden words, reports, spam checks;
  admin screen (reports, bans and suspensions, error log, storage, overview,
  audit log).
- **Quality:** EN/AR with full RTL, light/dark, PWA, accessibility (axe),
  performance (indexes, bundle budget), API reference (GET /docs) checked
  against every API test, 15 user journeys in the browser suites, CI.

## Working Style — IMPORTANT
- Build ONE feature at a time: a full vertical slice (backend route +
  matching frontend UI) before starting the next feature — not all backend
  then all frontend.
- Test each feature (manually or via Thunder Client) before moving on.
- Always explain clearly what was changed and why.
- Move to the next ROADMAP task per the Autonomy rules below (no asking).
- Deploy/hosting is deliberately saved for the very last step, after every
  other feature and gap is complete, to avoid repeated redeploys.

## Autonomy rules
The owner is busy and wants no questions.
- Never ask for approval or choices. Pick the safest
  reasonable option and log it in ROADMAP.md notes.
- Hard limits (never break): no push/merge to main, never
  touch .env or the production DB, no new external
  accounts/keys/paid services.
- If a task truly needs the owner, move it to NEEDS OWNER
  and continue with the next task.
- Finish with a short English report (English only, no Burmese).
- A usage limit or the owner can stop you anytime. Commit small WIP
  checkpoints often and keep ROADMAP.md notes current.

## Next Steps
The work follows MONTH_PLAN.md, one checkbox step at a time (WIP.md shows
where it stands). Going live (hosting, production database, real email,
push keys) needs the owner: GO_LIVE_CHECKLIST.md and LATER.md list exactly
what to do; every feature works without those accounts until then.

## Long-Term Vision (reference only, not active development)
A 52-category "Super App" master list was sketched as a long-term dream
(chat, payments/wallet, banking, e-commerce, ride-hailing, delivery, travel,
healthcare, education, jobs, real estate, gov services, AI, live streaming,
mini-app ecosystem, etc.), with a hamburger-menu "more services" section
planned for future expansion. This is a roadmap reference only — current
focus stays on finishing the social media MVP well, with clean modular code
(routes/controllers/middleware/models) that can extend later without
pre-building payment/banking/gov-service infrastructure now.
