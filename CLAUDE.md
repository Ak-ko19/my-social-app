# MySocialApp Project

## Tech Stack
- Backend: Node.js + Express
- Frontend: React + Vite
- Database: PostgreSQL
- OS: Windows, Editor: VS Code
- Location: C:\MyProjects\Mysocialapp (backend/ and frontend/ subfolders)

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

### Backend (all built and tested via Thunder Client)
- Backend setup (Express server)
- Database + tables (users, posts, comments, likes, follows)
- Signup route
- Login + JWT authentication (chosen over a simpler user_id-only approach for security)
- Profile route (GET /profile/:id)
- Post CRUD (create/get all/get one/edit/delete, with owner-check)
- News feed pagination (?page=/?limit= on GET /posts)
- Like/Comment feature (6 routes)
- Follow system (5 routes)
- Personalized feed (GET /feed, filtered by follows table)
- Edit Profile: added `bio` column to users table; built GET /profile/me
  and PUT /profile endpoints
- 18 edge-case tests passing (duplicate signup, missing fields, wrong
  password, invalid/non-existent ID, permission violations, etc.)

### Frontend (all built and tested, vertical-slice order)
- React project setup (Vite + React + JavaScript)
- Feed page (Feed.jsx, fetches/displays /feed)
- Signup/Login UI (JWT stored in localStorage, react-router-dom routes)
- Post creation UI (CreatePost.jsx)
- Like/Comment/Follow UI (buttons + comment section in Feed.jsx)
- Edit Profile UI (EditProfile.jsx — edit username, email, bio; linked from
  Feed page via App.jsx/Feed.jsx routes)

Full end-to-end flow verified in-browser: signup → login → view feed →
create post → like/unlike → comment → follow/unfollow → edit profile.

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

## Next Steps (in order)
Steps 1–6 below (input validation, forgot-password, comment edit, .env
secrets) are done — see the "Production-Readiness Audit" and "12-Feature
Production Batch" sections of PROJECT_DETAILED_GUIDE.md for what's actually
been built since this list was last updated (image upload, notifications,
DM/messaging with Socket.io + voice messages, search, dark mode, block/
report/bookmark/hashtags/mentions/private-accounts/account-management/
email-verification/rate-limiting/PWA are all live). This file's own
"Completed Features" list above predates most of that — trust
PROJECT_DETAILED_GUIDE.md over it.

1. Deploy (hosting) — the only step left. Deliberately saved for last per
   the working-style rule below, now that everything else is done.
2. (Optional) Refactor backend from single-file-per-concern into
   routes/controllers/middleware/models — mostly already the shape (see
   backend/), revisit only if it's still worth doing once deploy is live.
3. Real email delivery (Nodemailer/SendGrid/etc.) to replace the
   console-logged verification/reset links — swap the one function in
   backend/utils/email.js.

## Long-Term Vision (reference only, not active development)
A 52-category "Super App" master list was sketched as a long-term dream
(chat, payments/wallet, banking, e-commerce, ride-hailing, delivery, travel,
healthcare, education, jobs, real estate, gov services, AI, live streaming,
mini-app ecosystem, etc.), with a hamburger-menu "more services" section
planned for future expansion. This is a roadmap reference only — current
focus stays on finishing the social media MVP well, with clean modular code
(routes/controllers/middleware/models) that can extend later without
pre-building payment/banking/gov-service infrastructure now.
