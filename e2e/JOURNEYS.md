# User journeys (Days 64–66)

The 15 most important things a person does in MySocialApp, each walked
**only through the UI**, the way a person would. Every person has their own
browser context (their own storage, like their own phone), signs up and
logs in with the real forms, and nothing is set up behind the app's back,
with one exception: an admin is made with SQL, because the app has no
screen for that (an operator does it).

Each journey's checks start with its number (`J7 ...`), and
`backend/tests/api/ciWorkflow.test.js` checks that every journey in the
table below has checks in the suite it names.

| # | Journey | Suite | What it proves |
| --- | --- | --- | --- |
| J1 | New here | `journeys-core` | Landing page → sign up → log in → the first-run steps (skipped) → a first post, on Home and on the profile |
| J2 | Log out and back in | `journeys-core` | Logged out, an account page sends you to log in and back afterwards; a reload keeps you in |
| J3 | Follow someone | `journeys-core` | Search → profile → Follow; their post is on your Home; like and comment; they are notified of all three |
| J4 | A private account | `journeys-core` | Follow becomes a request; posts stay hidden until it is approved in Settings |
| J5 | Messages | `journeys-core` | A message from a profile reaches the inbox live; the reply comes back live |
| J6 | A group chat | `journeys-social` | Created with two people; live for everyone, with names on the bubbles |
| J7 | A photo post | `journeys-social` | The photo is really uploaded and loads on a follower's Home |
| J8 | A story | `journeys-social` | In a follower's tray marked new; opened, the photo loads; then marked seen |
| J9 | A group | `journeys-social` | Created; found under Discover, joined and posted in; the creator sees the post |
| J10 | A page and an event | `journeys-social` | A page's post reaches a follower's Home; an event gets a Going the host sees counted |
| J11 | Report → removed | `journeys-safety` | A reported post is removed by an admin from Reports; gone for the reporter; in the admin log |
| J12 | Block and unblock | `journeys-safety` | Blocked from a profile, the other can't find you; unblocked in Settings, they can |
| J13 | Another script, and Arabic | `journeys-safety` | An Arabic bio reads right to left in the English app; the app in Arabic (kept on reload, no sideways scroll) and back |
| J14 | Change password | `journeys-safety` | The other device is signed out; the old password fails, the new one works |
| J15 | Delete account | `journeys-safety` | Password + typed username; then no log-in, and nobody can find the account |

## Running them

```bash
cd e2e
E2E_ONLY="journeys-core journeys-social journeys-safety" bash run-all.sh
```

Each suite takes about 2–3 minutes on its own fresh stack. `journeys-social`
runs on the media stack (`E2E_MEDIA=1`): photo uploads go to
`cloudinary-stub.cjs`, a local stand-in that the backend's Cloudinary SDK is
pointed at with its own `upload_prefix` setting, so no account is needed and
the app's code is the same as in production.

In CI, `journeys-core` is in the smoke job (every push); all three run in
the full job (pull requests to `master`, and by hand).

## Adding a journey

Use `journey-kit.cjs`: `person()` (their own browser; `allow` for console
errors the journey expects), `signUp`, `logIn` / `attemptLogIn` (with
`{ refusal: true }` when a refused log-in is the point), `logOut`, `post`,
`openProfile`, `follow`, `loaded` (an image really arrived) and `until`.
Name the checks `J<n> ...`, add a row above, and keep each suite to about
five journeys so it stays a few minutes long.
