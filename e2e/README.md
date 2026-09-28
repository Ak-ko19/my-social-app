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
npm test              # all feature suites + the visual matrix in EN/MY/AR (~40 min)
npm run test:audit    # also the demo-seed check and the C4 audit checks
```

To run a single suite: `npm run up`, then `node b16-rtl.cjs`, then
`npm run down`.

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
| `a2-walkthrough` | The main user journey from signup to logout |
| `a3-visual` | Every route × 375/390/430 px × light/dark (`A3_LANG=en\|my\|ar`) |
| `b1-reactions` … `b16-rtl` | One suite per roadmap feature (B1–B16) |
| `c1-seed` | The world created by `npm run seed:demo` (needs the seed first) |
| `c2-legal` | Terms and Privacy pages |
| `c3-landing` | The public landing page |
| `c4-audit-checks` | Route auth table, Phase 1 fixes, API timings, `npm audit`, the deployed keep-alive ping |
| `day2-own-post` | Day 2: a new post is the first card on Home (EN/MY/AR, light/dark, 375px–desktop) |
| `day5-email-off` | Day 5: with no email provider the verify banner hides and forgot-password explains itself (EN/MY/AR); with email on both still work |
| `pixel-compare` | `node pixel-compare.cjs <baselineDir> <currentDir>`: pixel diff of two sets of A3 screenshots |

**Timing noise:** timestamps ("5m ago") depend on when a suite runs, and
Burmese glyph anti-aliasing can differ by a few pixels between runs.
Account for both when comparing screenshots.
