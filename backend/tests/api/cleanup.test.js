const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 9: the daily cleanup job (services/cleanupService.js, POST
// /internal/cleanup, .github/workflows/cleanup.yml).
const SECRET = 's'.repeat(64);
const CLOUD_ENV = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };

describe('daily cleanup', () => {
  const { app, reset } = setupTestApp();
  const cloudinary = require('../../config/cloudinary'); // the setupTestApp mock
  const saved = {};
  beforeAll(() => {
    for (const [k, v] of Object.entries({ ...CLOUD_ENV, CLEANUP_SECRET: SECRET })) { saved[k] = process.env[k]; process.env[k] = v; }
  });
  afterAll(() => Object.assign(process.env, saved));
  beforeEach(async () => {
    await reset();
    cloudinary.api.delete_resources.mockClear();
  });

  const img = (name) => `https://res.cloudinary.com/test/image/upload/v1/stories/${name}.jpg`;
  const cleanup = (query = '') => request(app).post(`/internal/cleanup${query}`).set('Authorization', `Bearer ${SECRET}`);
  const ids = async (sql) => (await pool.query(sql)).rows.map((r) => r.id);

  // A little of everything: things that must go and things that must stay.
  async function seed() {
    const u = await registerAndLogin(app);
    const v = await registerAndLogin(app);
    const story = (name, expires) => pool.query('INSERT INTO stories (user_id, media_url, expires_at) VALUES ($1, $2, now() + $3::interval) RETURNING id', [u.id, img(name), expires]);
    const expired = (await story('old', '-2 hours')).rows[0].id;
    const justExpired = (await story('grace', '-10 minutes')).rows[0].id; // within the 1 h grace
    const live = (await story('live', '5 hours')).rows[0].id;
    await pool.query('INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2), ($3, $2)', [expired, v.id, live]);
    const notif = (age, read) => pool.query("INSERT INTO notifications (user_id, actor_id, type, is_read, created_at) VALUES ($1, $2, 'follow', $3, now() - $4::interval) RETURNING id", [u.id, v.id, read, age]);
    const oldRead = (await notif('100 days', true)).rows[0].id;
    const oldUnread = (await notif('91 days', false)).rows[0].id;
    const recent = (await notif('89 days', false)).rows[0].id;
    const session = (expires, revoked) => pool.query('INSERT INTO sessions (user_id, expires_at, revoked_at) VALUES ($1, now() + $2::interval, now() - $3::interval) RETURNING id', [u.id, expires, revoked]);
    const expiredSession = (await session('-1 minute', null)).rows[0].id;
    const revokedLongAgo = (await session('6 days', '2 days')).rows[0].id;
    const revokedJustNow = (await session('6 days', '1 hour')).rows[0].id;
    return { u, expired, justExpired, live, oldRead, oldUnread, recent, expiredSession, revokedLongAgo, revokedJustNow };
  }

  it('deletes what is due and keeps everything else', async () => {
    const s = await seed();
    const res = await cleanup();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: false, stories: 1, storyMedia: 1, notifications: 2, sessions: 2 });
    expect(res.body.durationMs).toEqual(expect.any(Number));

    expect(await ids('SELECT id FROM stories ORDER BY id')).toEqual([s.justExpired, s.live]);
    expect((await pool.query('SELECT story_id FROM story_views')).rows.map((r) => r.story_id)).toEqual([s.live]);
    expect(await ids('SELECT id FROM notifications')).toEqual([s.recent]);
    const sessions = await ids('SELECT id FROM sessions');
    expect(sessions).toContain(s.revokedJustNow);
    expect(sessions).not.toContain(s.expiredSession);
    expect(sessions).not.toContain(s.revokedLongAgo);
    // Left: the two live login sessions from registerAndLogin + revokedJustNow.
    expect(sessions).toHaveLength(3);
  });

  it("deletes the expired stories' photos from Cloudinary, and only those", async () => {
    await seed();
    await cleanup();
    const deleted = cloudinary.api.delete_resources.mock.calls.flatMap(([batch]) => batch);
    expect(deleted).toEqual(['stories/old']);
  });

  it('a dry run only counts', async () => {
    await seed();
    const res = await cleanup('?dryRun=1');
    expect(res.body).toMatchObject({ dryRun: true, stories: 1, notifications: 2, sessions: 2 });
    expect((await pool.query('SELECT count(*)::int AS n FROM stories')).rows[0].n).toBe(3);
    expect(cloudinary.api.delete_resources).not.toHaveBeenCalled();
  });

  it('works through a large backlog in batches', async () => {
    const u = await registerAndLogin(app);
    await pool.query("INSERT INTO notifications (user_id, actor_id, type, created_at) SELECT $1, $1, 'follow', now() - interval '120 days' FROM generate_series(1, 12000)", [u.id]);
    const res = await cleanup();
    expect(res.body.notifications).toBe(12000);
    expect((await pool.query('SELECT count(*)::int AS n FROM notifications')).rows[0].n).toBe(0);
  });

  it('is a no-op the second time', async () => {
    await seed();
    await cleanup();
    expect((await cleanup()).body).toMatchObject({ stories: 0, storyMedia: 0, notifications: 0, sessions: 0 });
  });

  describe('the endpoint is hidden without the secret', () => {
    it('404s without the secret, with a wrong one, or when none is configured', async () => {
      expect((await request(app).post('/internal/cleanup')).status).toBe(404);
      expect((await request(app).post('/internal/cleanup').set('Authorization', `Bearer ${'x'.repeat(64)}`)).status).toBe(404);
      expect((await request(app).post('/internal/cleanup').set('Authorization', SECRET)).status).toBe(404); // no "Bearer "
      const user = await registerAndLogin(app);
      expect((await request(app).post('/internal/cleanup').set('Authorization', `Bearer ${user.token}`)).status).toBe(404); // a user token isn't it
      process.env.CLEANUP_SECRET = '';
      try {
        expect((await request(app).post('/internal/cleanup').set('Authorization', 'Bearer ')).status).toBe(404);
        expect((await request(app).post('/internal/cleanup').set('Authorization', `Bearer ${SECRET}`)).status).toBe(404);
      } finally {
        process.env.CLEANUP_SECRET = SECRET;
      }
    });

    it('does nothing when refused', async () => {
      await seed();
      await request(app).post('/internal/cleanup').set('Authorization', 'Bearer wrong');
      expect((await pool.query('SELECT count(*)::int AS n FROM stories')).rows[0].n).toBe(3);
    });
  });

  it('startup check: a short secret is an error, a missing one warns in production', () => {
    const { checkEnv } = require('../../config/env');
    const base = { DATABASE_URL: 'postgresql://u@h/db', JWT_SECRET: 'x'.repeat(40) };
    expect(checkEnv({ ...base, CLEANUP_SECRET: 'short' }).errors.join()).toMatch(/CLEANUP_SECRET must be at least 32/);
    expect(checkEnv({ ...base, CLEANUP_SECRET: SECRET }).errors).toEqual([]);
    const prod = { ...base, RENDER: 'true', ALLOWED_ORIGINS: 'https://a.example', FRONTEND_URL: 'https://a.example' };
    expect(checkEnv(prod).warnings.join()).toMatch(/CLEANUP_SECRET is not set/);
    expect(checkEnv(base).warnings.join()).not.toMatch(/CLEANUP_SECRET/); // local dev: fine without
  });

  it('the scheduled workflow is valid and calls the endpoint daily', () => {
    const yaml = require('js-yaml');
    const wf = yaml.load(fs.readFileSync(path.join(__dirname, '../../../.github/workflows/cleanup.yml'), 'utf8'));
    expect(wf.on.schedule).toEqual([{ cron: '17 3 * * *' }]);
    expect(wf.on).toHaveProperty('workflow_dispatch');
    expect(wf.permissions).toEqual({});
    const step = wf.jobs.cleanup.steps[0];
    expect(step.env.SECRET).toBe('${{ secrets.CLEANUP_SECRET }}');
    expect(step.env.URL).toMatch(/\/internal\/cleanup'? \}\}$/);
    expect(step.run).toMatch(/if \[ -z "\$SECRET" \]/); // skips cleanly until the owner adds the secret
  });
});
