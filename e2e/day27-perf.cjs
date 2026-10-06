// Day 27: database performance. Seeds about a million rows
// (day27-perf.sql), then calls the app's main read endpoints as alice and
// FAILs if any of them makes Postgres read a big table end to end (a
// sequential scan): with this much data that is always a missing index.
// Postgres' own per-table counters (pg_stat_user_tables.seq_scan) are
// deterministic, unlike timings -- timings are printed for information.
// Throwaway stack (e2e-up.sh): alice(1), bob(2), with post 1 by alice.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const API = 'http://localhost:3000';
const DB = `${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e`;
// Only tables over 4 MB (500 pages of 8 kB) count. Reading a smaller one
// end to end takes about a millisecond, and Postgres rightly prefers that
// for a join touching many of its rows (e.g. users here, 30k rows); it
// switches to the index by itself as the table grows.
const BIG_PAGES = 500;
// A request may read at most this many rows of those big tables in all
// (from table scans or index lookups). Catches a plan that walks a whole
// index -- e.g. every post newest first, looking for 5 with a rare tag --
// which is no sequential scan but just as slow.
const MAX_ROWS = 20000;
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const sql = (q) => execSync(`${DB} -Atc "${q}"`, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seqScans() {
  const rows = sql("SELECT s.relname, s.seq_scan, c.relpages, s.seq_tup_read + COALESCE(s.idx_tup_fetch, 0) FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid");
  return Object.fromEntries(rows.split('\n').map((l) => l.split('|')).map(([t, s, n, rows]) => [t, { seq: Number(s), pages: Number(n), rows: Number(rows) }]));
}

(async () => {
  // PERF_SKIP_SEED=1: run again on the same (already seeded) database.
  if (!process.env.PERF_SKIP_SEED) {
    const t0 = Date.now();
    execSync(`${DB} -q -f "${path.join(SP, 'day27-perf.sql')}"`, { stdio: 'inherit' });
    console.log(`seeded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  const perfUser = sql("SELECT min(id) FROM users WHERE username LIKE 'perf%'");
  const perfPost = sql("SELECT min(id) + 70000 FROM posts WHERE content LIKE 'Perf post %'");
  const conv = sql(`SELECT min(id) FROM conversations WHERE user_a_id = 1 AND user_b_id >= ${perfUser}`);

  const endpoints = [
    '/feed', '/feed?page=5', '/posts?page=1&limit=10', `/posts/${perfPost}`, `/posts/${perfPost}/comments`, `/posts/${perfPost}/likes`,
    `/profile/${perfUser}`, '/profile/me', `/users/${perfUser}/posts`, `/users/${perfUser}/follow-counts`,
    '/users/1/followers', '/users/1/following', '/users/suggestions', '/follow-requests',
    // Day 37: friends (mutual follows) and connections.
    '/users/1/connections?type=friends', '/users/1/connections?type=followers', `/users/${perfUser}/mutual-friends`,
    '/notifications', '/notifications/unread-count', '/conversations', `/conversations/${conv}`,
    `/conversations/${conv}/messages`, '/explore/posts', '/explore/hashtags', '/hashtags/perf/posts', '/hashtags/perf/posts?sort=top', '/hashtags/mingalar/posts',
    '/bookmarks', '/stories', '/blocked-users',
    // Search is a substring match (ILIKE '%q%'): served by the pg_trgm
    // indexes (002). A word that matches nothing is the worst case.
    '/search/posts?q=shwedagon', '/search/posts?q=mohinga', '/search/posts?q=perf', '/search/posts?q=sunset%20shwedagon', '/search/users?q=perf12', '/search/users?q=zawgyi'
  ];

  const results = [];
  const auth = { Authorization: `Bearer ${aliceToken}` };
  for (const ep of endpoints) {
    const before = seqScans();
    const start = Date.now();
    // A request that takes over 20 s counts as a failure (cancelled after).
    const res = await fetch(API + ep, { headers: auth, signal: AbortSignal.timeout(20000) })
      .then(async (r) => { await r.arrayBuffer(); return r; })
      .catch(() => ({ status: 'timeout' }));
    if (res.status === 'timeout') execSync(`${DB} -Atc "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid()"`);
    const ms = Date.now() - start;
    // A server connection reports its counters at most once a second, and
    // when idle within 10 s; wait that long so each scan is counted
    // against the request that caused it.
    await sleep(11000);
    const after = seqScans();
    const scanned = Object.keys(after).filter((t) => after[t].pages >= BIG_PAGES && after[t].seq > (before[t]?.seq ?? 0));
    const big = Object.keys(after).filter((t) => after[t].pages >= BIG_PAGES);
    const rowsRead = big.reduce((sum, t) => sum + after[t].rows - (before[t]?.rows ?? 0), 0);
    const status = res.status !== 200 || scanned.length || rowsRead > MAX_ROWS ? 'FAIL' : 'PASS';
    results.push(`${status}  ${ep.padEnd(38)} ${String(res.status)} ${String(ms).padStart(5)} ms ${String(rowsRead).padStart(7)} rows`
      + (scanned.length ? `  -- full scan of: ${scanned.join(', ')}` : '')
      + (rowsRead > MAX_ROWS ? `  -- read over ${MAX_ROWS} rows` : ''));
  }

  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
