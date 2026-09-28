# LATER — things only the owner can do

Claude Code skips these and keeps building everything else so the app works
without them. Newest items at the bottom.

## 1. Check the first CI run on GitHub (Day 1)
- `dev` was pushed on 2026-09-28, which triggers `.github/workflows/ci.yml`.
- Claude Code can't see the Actions tab here: the repo is private, `gh` isn't
  installed, and the browser extension isn't connected.
- The same jobs pass locally: backend API tests, frontend lint,
  `check:i18n` and build.
- **Owner:** open https://github.com/Ak-ko19/my-social-app/actions and check
  that the "CI" run on `dev` is green. If it's red, paste the failing log
  into the next session.
- Optional: install the GitHub CLI (`winget install GitHub.cli`, then
  `gh auth login`) so future sessions can read CI results themselves.

## 2. Merging to master and GO LIVE days (Days 7, 14, 21, 30, …)
- CLAUDE.md's hard limits forbid Claude Code from pushing or merging to
  `master` and from touching the production database.
- Those limits override MONTH_PLAN's GO LIVE steps, so every GO LIVE is an
  owner action.
- Until `dev` is merged, the keep-alive schedule doesn't run: GitHub only
  runs `schedule` workflows from the default branch (`master`).
- On 2026-09-28 the live backend answered `GET /` with 200 after a
  **22.1 s cold start**.
- **Owner:** when ready, follow GO_LIVE_CHECKLIST.md (written on Day 6).
  To let Claude Code do GO LIVE steps itself, change the hard limits in
  CLAUDE.md.
