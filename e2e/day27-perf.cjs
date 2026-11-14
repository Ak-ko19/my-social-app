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
  // Days 109-110: the busy thread (500 replies) on the measured post.
  const busyThread = sql(`SELECT min(id) FROM comments WHERE post_id = ${perfPost} AND content = 'Thread 1'`);
  // Day 113: the busy group (20k members) and page (20k followers), and an
  // event alice is going to.
  const busyGroup = sql("SELECT min(id) FROM communities WHERE name LIKE 'Perf group %'");
  const busyPage = sql("SELECT min(id) FROM pages WHERE name LIKE 'Perf page %'");
  const event = sql("SELECT min(e.id) FROM events e JOIN event_responses r ON r.event_id = e.id AND r.user_id = 1");

  const endpoints = [
    '/feed', '/feed?page=5', '/posts?page=1&limit=10', `/posts/${perfPost}`, `/posts/${perfPost}/comments`, `/posts/${perfPost}/comments?sort=newest`, `/posts/${perfPost}/comments?sort=newest&cursor=${busyThread}`,
    `/comments/${busyThread}/replies?cursor=0`, `/posts/${perfPost}/likes`,
    `/profile/${perfUser}`, '/profile/me', `/users/${perfUser}/posts`, `/users/${perfUser}/follow-counts`,
    '/users/suggestions', '/follow-requests',
    // Day 37: friends (mutual follows) and connections.
    '/users/1/connections?type=friends', '/users/1/connections?type=followers', '/users/1/connections?type=following',
    // Day 69: the group-member picker's search.
    '/users/1/connections?type=following&q=perf', `/users/${perfUser}/mutual-friends`,
    '/notifications', '/notifications?filter=unread', '/notifications?filter=mentions', '/notifications/unread-count', '/conversations', `/conversations/${conv}`,
    `/conversations/${conv}/messages`, `/conversations/${conv}/search?q=message`, '/explore/posts', '/explore/hashtags', '/hashtags/perf/posts', '/hashtags/perf/posts?sort=top', '/hashtags/mingalar/posts',
    '/bookmarks', '/stories', '/blocked-users',
    // Day 48: the activity log.
    '/activity/likes', '/activity/comments',
    // Days 83-84: memories (one person's posts on this day in earlier years).
    '/memories?tz=UTC', `/memories?tz=Asia/Tokyo&date=2026-02-28`,
    // Search is a substring match (ILIKE '%q%'): served by the pg_trgm
    // indexes (002). A word that matches nothing is the worst case.
    '/search/posts?q=shwedagon', '/search/posts?q=mohinga', '/search/posts?q=perf', '/search/posts?q=sunset%20shwedagon', '/search/users?q=perf12', '/search/users?q=zawgyi', '/search/hashtags?q=t1', '/search/hashtags?q=perf',
    // Day 61: Admin > Overview (alice is made an admin below).
    '/admin/overview?days=90',
    // Days 103-104: the admin search -- posts and comments through their
    // trigram indexes (002, 084), accounts by username or exact email.
    '/admin/search?q=shwedagon&type=posts', '/admin/search?q=mohinga&type=comments', '/admin/search?q=perf12&type=users',
    // Day 113: lists that had no rows here before -- groups, pages, events
    // (Days 50-56), archived chats (97), followed tags (107), Admin >
    // Reports and > Verification (103, 106).
    '/communities', '/communities?q=perf', `/communities/${busyGroup}`, `/communities/${busyGroup}/posts`, `/communities/${busyGroup}/members`,
    '/pages', '/pages?q=perf', `/pages/${busyPage}`, `/pages/${busyPage}/posts`,
    '/events', '/events?section=discover', `/events/${event}`, `/events/${event}/guests`,
    '/conversations?archived=1', '/followed-hashtags',
    '/admin/reports', '/admin/reports?status=reviewed', '/admin/page-verifications', '/admin/page-verifications?status=reviewed'
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
  // Day 113: Explore reads a ranking its job rebuilds (every 2 minutes in
  // production; this stack only rebuilds when told -- run-all's perf
  // stack). Rebuild it now, as a running server has, and measure the job
  // itself: a batch over the week's posts, never a full scan of a big table.
  {
    process.env.DATABASE_URL = 'postgresql://testuser@localhost:55433/mysocialapp_e2e';
    const exploreRanking = require('../backend/services/exploreRankingService');
    const before = seqScans();
    const start = Date.now();
    const { refreshed, posts } = await exploreRanking.refresh();
    const ms = Date.now() - start;
    // Ends this process's idle connection too, publishing its counters
    // (db.js then logs "database connection lost (idle client)": expected).
    await publishServerCounters();
    const after = seqScans();
    const scanned = Object.keys(after).filter((t) => after[t].pages >= BIG_PAGES && after[t].seq > (before[t]?.seq ?? 0));
    const rows = Object.keys(after).filter((t) => after[t].pages >= BIG_PAGES)
      .reduce((sum, t) => sum + after[t].rows - (before[t]?.rows ?? 0), 0);
    results.push(`${refreshed && posts > 0 && !scanned.length ? 'PASS' : 'FAIL'}  Explore ranking job (${posts} posts ranked) ${String(ms).padStart(5)} ms ${String(rows).padStart(7)} rows`
      + (scanned.length ? `  -- full scan of: ${scanned.join(', ')}` : ''));
  }
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
    const isBig = (t) => after[t].pages >= BIG_PAGES;
    const scanned = Object.keys(after).filter((t) => isBig(t) && after[t].seq > (before[t]?.seq ?? 0));
    const big = Object.keys(after).filter(isBig);
    const rowsByTable = big.map((t) => [t, after[t].rows - (before[t]?.rows ?? 0)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const rowsRead = rowsByTable.reduce((sum, [, n]) => sum + n, 0);
    rowsOf[ep] = rowsRead;
    const status = res.status !== 200 || scanned.length || rowsRead > MAX_ROWS ? 'FAIL' : 'PASS';
    results.push(`${status}  ${ep.padEnd(38)} ${String(res.status)} ${String(ms).padStart(5)} ms ${String(rowsRead).padStart(7)} rows`
      + (scanned.length ? `  -- full scan of: ${scanned.join(', ')}` : '')
      // Which tables, so a failure says where to look.
      + (rowsRead > MAX_ROWS ? `  -- read over ${MAX_ROWS} rows: ${rowsByTable.slice(0, 4).map(([t, n]) => `${t} ${n}`).join(', ')}` : ''));
  }
  // Day 74: ?page=5 walks the posts of pages 1 to 5; the cursor starts the
  // index scan at its post and walks page 5's only -- a share of the same
  // total (0.28-0.43 in runs so far; how many rows a page walks depends on
  // the seed's random follows). A cursor that became a filter again reads
  // as much as OFFSET (0.99).
  // Day 113: posting in the busy group (20k members). alice is made one of
  // its admins, so with everyone's default (Highlights) the post is for
  // all of them. The request only queues it; the queue's drain tells each
  // member once, in chunks, with no full scan of a big table.
  {
    sql(`UPDATE community_members SET role = 'admin' WHERE community_id = ${busyGroup} AND user_id = 1`);
    const audience = Number(sql(`SELECT count(*) FROM community_members WHERE community_id = ${busyGroup} AND status = 'member' AND user_id <> 1`));
    const form = new FormData();
    form.append('content', 'Perf: a post for 20k members');
    form.append('communityId', String(busyGroup));
    await publishServerCounters();
    let before = seqScans();
    let start = Date.now();
    const res = await fetch(`${API}/posts`, { method: 'POST', headers: auth, body: form, signal: AbortSignal.timeout(20000) }).catch(() => ({ status: 'timeout' }));
    const postMs = Date.now() - start;
    await publishServerCounters();
    let after = seqScans();
    const bigNow = Object.keys(after).filter((t) => after[t].pages >= BIG_PAGES);
    const rowsDuring = (a, b) => bigNow.reduce((sum, t) => sum + a[t].rows - (b[t]?.rows ?? 0), 0);
    const told = () => Number(sql("SELECT count(*) FROM notifications WHERE type = 'group_post' AND post_id = (SELECT max(id) FROM posts WHERE content = 'Perf: a post for 20k members')"));
    const postRows = rowsDuring(after, before);
    // The stack's ticker may start on the queue at any moment, so "queued"
    // = not everyone was told inside the request (0 unless a tick fell in
    // between).
    const toldAtReply = told();
    results.push(`${res.status === 201 && postRows <= MAX_ROWS && toldAtReply < audience ? 'PASS' : 'FAIL'}  POST /posts in the busy group: queued, not sent ${String(res.status)} ${String(postMs).padStart(5)} ms ${String(postRows).padStart(7)} rows`);

    // Drained here (the ticker may share the work: SKIP LOCKED), so the
    // check is on the result: every member told exactly once.
    const fanout = require('../backend/services/postFanoutService');
    before = seqScans();
    start = Date.now();
    const { notified, chunks } = await fanout.drain({ budgetMs: 120000 });
    for (const until = Date.now() + 60000; Date.now() < until && Number(sql('SELECT count(*) FROM post_fanout_queue')) > 0;) await sleep(250);
    const drainMs = Date.now() - start;
    await publishServerCounters();
    after = seqScans();
    const scanned = bigNow.filter((t) => after[t].seq > (before[t]?.seq ?? 0));
    const total = told();
    const distinct = Number(sql("SELECT count(DISTINCT user_id) FROM notifications WHERE type = 'group_post' AND post_id = (SELECT max(id) FROM posts WHERE content = 'Perf: a post for 20k members')"));
    results.push(`${total === audience && distinct === audience && !scanned.length ? 'PASS' : 'FAIL'}  ...the queue tells all ${audience} members once (${chunks} chunks here) ${String(drainMs).padStart(5)} ms ${String(rowsDuring(after, before)).padStart(7)} rows`
      + (scanned.length ? `  -- full scan of: ${scanned.join(', ')}` : '') + (total !== audience || distinct !== audience ? `  -- ${total} rows, ${distinct} people (${notified} here)` : ''));
  }
  const ratio = rowsOf[feedByCursor] / rowsOf['/feed?page=5'];
  results.push(`${ratio < 0.7 ? 'PASS' : 'FAIL'}  /feed page 5 by cursor reads well under ?page=5  -- ${rowsOf[feedByCursor]} vs ${rowsOf['/feed?page=5']} rows`);

  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
