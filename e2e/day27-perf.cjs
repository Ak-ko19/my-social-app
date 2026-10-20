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

// Day 74: a server connection publishes its counters at most once a second
// while busy, and within 10 s once idle -- an 11 s wait per endpoint was 8
// of this suite's 8.5 minutes. A connection that ends publishes them at
// once (Postgres 15+). So: wait until the server's connections are idle (a
// request may still query after its response), end them (the server's pool
// opens a fresh one on the next query; db.js), and wait until they're gone.
const OTHERS = "datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'";
async function until(check, what) {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${what}`);
}
async function publishServerCounters() {
  await until(() => sql(`SELECT count(*) FROM pg_stat_activity WHERE ${OTHERS} AND state <> 'idle'`) === '0', 'the server to go idle');
  const ended = sql(`SELECT string_agg(pid::text, ',') FROM (SELECT pid, pg_terminate_backend(pid) FROM pg_stat_activity WHERE ${OTHERS} AND state = 'idle') t`);
  if (ended) await until(() => sql(`SELECT count(*) FROM pg_stat_activity WHERE pid IN (${ended})`) === '0', 'its connections to end');
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
    '/users/suggestions', '/follow-requests',
    // Day 37: friends (mutual follows) and connections.
    '/users/1/connections?type=friends', '/users/1/connections?type=followers', '/users/1/connections?type=following',
    // Day 69: the group-member picker's search.
    '/users/1/connections?type=following&q=perf', `/users/${perfUser}/mutual-friends`,
    '/notifications', '/notifications/unread-count', '/conversations', `/conversations/${conv}`,
    `/conversations/${conv}/messages`, '/explore/posts', '/explore/hashtags', '/hashtags/perf/posts', '/hashtags/perf/posts?sort=top', '/hashtags/mingalar/posts',
    '/bookmarks', '/stories', '/blocked-users',
    // Day 48: the activity log.
    '/activity/likes', '/activity/comments',
    // Search is a substring match (ILIKE '%q%'): served by the pg_trgm
    // indexes (002). A word that matches nothing is the worst case.
    '/search/posts?q=shwedagon', '/search/posts?q=mohinga', '/search/posts?q=perf', '/search/posts?q=sunset%20shwedagon', '/search/users?q=perf12', '/search/users?q=zawgyi', '/search/hashtags?q=t1', '/search/hashtags?q=perf',
    // Day 61: Admin > Overview (alice is made an admin below).
    '/admin/overview?days=90'
  ];

  const results = [];
  const auth = { Authorization: `Bearer ${aliceToken}` };
  // Day 61: the overview counts each finished day once (the ticker does
  // it as days end; the first time, 90 days back). Do that once here, as a
  // running server already has, so what's measured is a normal visit.
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  await fetch(`${API}/admin/overview?days=90`, { headers: auth });
  // Day 74: the same fifth page as /feed?page=5, reached the way Home now
  // does -- by the cursor after the first 40 posts (no OFFSET).
  const { nextCursor } = await (await fetch(`${API}/feed?limit=40`, { headers: auth })).json();
  const feedByCursor = `/feed?cursor=${encodeURIComponent(nextCursor)}`;
  endpoints.splice(2, 0, feedByCursor);
  const rowsOf = {};
  // The set-up requests above must not count against the first endpoint.
  await publishServerCounters();
  for (const ep of endpoints) {
    const before = seqScans();
    const start = Date.now();
    // A request that takes over 20 s counts as a failure (cancelled after).
    const res = await fetch(API + ep, { headers: auth, signal: AbortSignal.timeout(20000) })
      .then(async (r) => { await r.arrayBuffer(); return r; })
      .catch(() => ({ status: 'timeout' }));
    if (res.status === 'timeout') execSync(`${DB} -Atc "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid()"`);
    const ms = Date.now() - start;
    // So each scan is counted against the request that caused it.
    await publishServerCounters();
    const after = seqScans();
    const scanned = Object.keys(after).filter((t) => after[t].pages >= BIG_PAGES && after[t].seq > (before[t]?.seq ?? 0));
    const big = Object.keys(after).filter((t) => after[t].pages >= BIG_PAGES);
    const rowsRead = big.reduce((sum, t) => sum + after[t].rows - (before[t]?.rows ?? 0), 0);
    rowsOf[ep] = rowsRead;
    const status = res.status !== 200 || scanned.length || rowsRead > MAX_ROWS ? 'FAIL' : 'PASS';
    results.push(`${status}  ${ep.padEnd(38)} ${String(res.status)} ${String(ms).padStart(5)} ms ${String(rowsRead).padStart(7)} rows`
      + (scanned.length ? `  -- full scan of: ${scanned.join(', ')}` : '')
      + (rowsRead > MAX_ROWS ? `  -- read over ${MAX_ROWS} rows` : ''));
  }
  // Day 74: ?page=5 walks the posts of pages 1 to 5; the cursor starts the
  // index scan at its post and walks page 5's only -- a share of the same
  // total (0.28-0.43 in runs so far; how many rows a page walks depends on
  // the seed's random follows). A cursor that became a filter again reads
  // as much as OFFSET (0.99).
  const ratio = rowsOf[feedByCursor] / rowsOf['/feed?page=5'];
  results.push(`${ratio < 0.7 ? 'PASS' : 'FAIL'}  /feed page 5 by cursor reads well under ?page=5  -- ${rowsOf[feedByCursor]} vs ${rowsOf['/feed?page=5']} rows`);

  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
