const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 61: Admin > Overview -- daily counts (finished UTC days from
// daily_stats, today live), totals, storage levels.
describe('admin overview (Day 61)', () => {
  // The storage level measures the whole database (pg_database_size).
  jest.setTimeout(20000);
  const { app, reset } = setupTestApp();
  const stats = () => require('../../services/statsService');
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const get = (user, query = '') => request(app).get(`/admin/overview${query}`).set(auth(user));
  const sql = async (q, params) => (await pool.query(q, params)).rows;
  // Noon (UTC) n days ago, and that day's date -- both worked out by
  // Postgres, so the test can't straddle midnight differently from it.
  const NOON = (n) => `((date_trunc('day', now() AT TIME ZONE 'UTC') - interval '${n} days' + interval '12 hours') AT TIME ZONE 'UTC')`;
  const dayAgo = async (n) => (await sql(`SELECT ((now() AT TIME ZONE 'UTC')::date - ${n})::text AS d`))[0].d;

  let admin;
  beforeEach(async () => {
    await reset();
    admin = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
  });

  // Something to count on a past day: a signup, 2 posts, 3 comments, 1 report.
  async function busyDay(n) {
    const [u] = await sql(`INSERT INTO users (username, email, password, created_at) VALUES ('old${n}', 'old${n}@example.com', 'x', ${NOON(n)}) RETURNING id`);
    const posts = await sql(`INSERT INTO posts (user_id, content, created_at) SELECT $1, 'p', ${NOON(n)} FROM generate_series(1, 2) RETURNING id`, [u.id]);
    await sql(`INSERT INTO comments (post_id, user_id, content, created_at) SELECT $1, $2, 'c', ${NOON(n)} FROM generate_series(1, 3)`, [posts[0].id, u.id]);
    await sql(`INSERT INTO reports (reporter_id, target_type, target_id, reason, created_at) VALUES ($1, 'post', $2, 'spam', ${NOON(n)})`, [admin.id, posts[1].id]);
  }

  it('admins only (others get 404, like every admin route)', async () => {
    const someone = await registerAndLogin(app);
    expect((await get(someone)).status).toBe(404);
    expect((await request(app).get('/admin/overview')).status).toBe(401);
  });

  it('days is 7, 30 (the default) or 90', async () => {
    expect((await get(admin)).body.series).toHaveLength(30);
    expect((await get(admin, '?days=7')).body.series).toHaveLength(7);
    expect((await get(admin, '?days=90')).body.series).toHaveLength(90);
    for (const bad of ['14', 'x', '-7', '7.5']) {
      const res = await get(admin, `?days=${bad}`);
      expect(res.status).toBe(400);
      expect(res.text).toBe('days must be one of: 7, 30, 90');
    }
  });

  it('one point per day, oldest first: past days counted, today live', async () => {
    await busyDay(2);
    await busyDay(5);
    const { series } = (await get(admin, '?days=7')).body;
    expect(series.map((p) => p.day)).toEqual(await Promise.all([6, 5, 4, 3, 2, 1, 0].map(dayAgo)));
    const on = (n) => series[6 - n];
    expect(on(2)).toMatchObject({ signups: 1, posts: 2, comments: 3, reports: 1 });
    expect(on(5)).toMatchObject({ signups: 1, posts: 2, comments: 3, reports: 1 });
    expect(on(3)).toMatchObject({ signups: 0, posts: 0, comments: 0, reports: 0 });
    // Today: the admin signed up a moment ago; a post now shows at once.
    expect(on(0)).toMatchObject({ signups: 1, posts: 0 });
    await sql('INSERT INTO posts (user_id, content) VALUES ($1, $2)', [admin.id, 'now']);
    expect((await get(admin, '?days=7')).body.series[6]).toMatchObject({ signups: 1, posts: 1 });
  });

  it('finished days are counted once: the first roll-up fills 90 days, later ones only new days', async () => {
    expect(await stats().rollUp()).toEqual({ days: 90 });
    const [range] = await sql(`SELECT count(*)::int AS n, (min(day) = (now() AT TIME ZONE 'UTC')::date - 90) AS from_ok,
      (max(day) = (now() AT TIME ZONE 'UTC')::date - 1) AS to_ok FROM daily_stats`);
    expect(range).toEqual({ n: 90, from_ok: true, to_ok: true });
    expect(await stats().rollUp()).toEqual({ days: 0 });
    // A missing finished day (e.g. the server slept through midnight) is
    // filled in next time, without touching the others.
    await sql(`DELETE FROM daily_stats WHERE day = (now() AT TIME ZONE 'UTC')::date - 1`);
    await sql(`UPDATE daily_stats SET posts = 99 WHERE day = (now() AT TIME ZONE 'UTC')::date - 2`);
    expect(await stats().rollUp()).toEqual({ days: 1 });
    expect((await sql(`SELECT posts FROM daily_stats WHERE day = (now() AT TIME ZONE 'UTC')::date - 2`))[0].posts).toBe(99);
  });

  it('two servers rolling up at once: a day the other one wrote first is kept', async () => {
    const other = await pool.connect();
    try {
      // The other server is writing yesterday, not committed yet.
      await other.query('BEGIN');
      await other.query(`INSERT INTO daily_stats (day, posts) VALUES ((now() AT TIME ZONE 'UTC')::date - 1, 42)`);
      const mine = stats().rollUp(); // waits on that row
      await new Promise((r) => setTimeout(r, 300));
      await other.query('COMMIT');
      expect(await mine).toEqual({ days: 89 });
    } finally {
      other.release();
    }
    expect(await sql(`SELECT posts FROM daily_stats WHERE day = (now() AT TIME ZONE 'UTC')::date - 1`)).toEqual([{ posts: 42 }]);
  });

  it('the ticker keeps it up to date', async () => {
    await busyDay(1);
    await require('../../services/ticker').tick();
    expect(await sql(`SELECT signups, posts, comments, reports FROM daily_stats WHERE day = (now() AT TIME ZONE 'UTC')::date - 1`))
      .toEqual([{ signups: 1, posts: 2, comments: 3, reports: 1 }]);
  });

  it('totals: exact while small; Postgres\' estimate once big', async () => {
    await busyDay(3);
    await sql(`INSERT INTO communities (name, created_by) VALUES ('G', $1)`, [admin.id]);
    await sql(`INSERT INTO error_groups (fingerprint, source, message) VALUES (repeat('a', 40), 'api', 'boom'), (repeat('b', 40), 'api', 'old')`);
    await sql(`UPDATE error_groups SET resolved_at = now() WHERE fingerprint = repeat('b', 40)`);
    const { totals } = (await get(admin)).body;
    expect(totals).toEqual({
      users: { count: 2, estimated: false },
      posts: { count: 2, estimated: false },
      comments: { count: 3, estimated: false },
      groups: 1,
      pages: 0,
      pendingReports: 1,
      openErrors: 1
    });
    const saved = stats().ESTIMATE_FROM;
    stats().ESTIMATE_FROM = 1;
    try {
      await sql('ANALYZE posts');
      expect((await get(admin)).body.totals.posts).toEqual({ count: 2, estimated: true });
    } finally {
      stats().ESTIMATE_FROM = saved;
    }
  });

  it('storage: the database level, and Cloudinary unknown without keys', async () => {
    const { storage } = (await get(admin)).body;
    expect(storage.database).toEqual({ percent: expect.any(Number), level: 'ok' });
    expect(storage.cloudinary.level).toBe('unknown');
  });
});
