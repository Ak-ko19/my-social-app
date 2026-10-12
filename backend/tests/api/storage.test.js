const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 57 step 3: Admin > Storage -- the database against its plan,
// Cloudinary's usage, the last 24 hours of uploads, warnings at 80 / 95 %.
describe('admin storage (Day 57)', () => {
  // A report measures the whole database (pg_database_size walks its files):
  // ~0.5 s on the local test cluster, more when the full suite loads the
  // machine.
  jest.setTimeout(20000);
  const { app, reset } = setupTestApp();
  const ENV = ['NEON_STORAGE_LIMIT_MB', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  const storage = () => require('../../services/storageService');
  const cloudinary = () => require('../../config/cloudinary');
  beforeEach(async () => {
    await reset();
    for (const k of ENV) delete process.env[k];
    storage().resetCache();
  });
  afterAll(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const get = (user) => request(app).get('/admin/storage').set(auth(user));
  let admin;
  beforeEach(async () => {
    admin = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
  });
  const withCloudinary = (usage) => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'k';
    process.env.CLOUDINARY_API_SECRET = 's';
    cloudinary().api.usage = usage;
  };

  it('admins only (others get 404, like every admin route)', async () => {
    const someone = await registerAndLogin(app);
    expect((await get(someone)).status).toBe(404);
    expect((await request(app).get('/admin/storage')).status).toBe(401);
  });

  it('the database: its size against 512 MB by default, the biggest tables; ok', async () => {
    const res = (await get(admin)).body;
    expect(res.database.bytes).toBeGreaterThan(0);
    expect(res.database.limitBytes).toBe(512 * 1024 * 1024);
    expect(res.database.level).toBe('ok');
    expect(res.database.tables.length).toBeGreaterThan(0);
    expect(res.database.tables.length).toBeLessThanOrEqual(8);
    expect(res.database.tables[0]).toEqual({ name: expect.any(String), bytes: expect.any(Number) });
    expect(res.cloudinary).toEqual({ configured: false, level: 'unknown' });
    expect(res.warnings).toEqual([]);
    expect(res).toMatchObject({ warnAt: 80, alertAt: 95 });
  });

  it('near the limit: an alert (a tiny NEON_STORAGE_LIMIT_MB stands in for a full database)', async () => {
    process.env.NEON_STORAGE_LIMIT_MB = '1';
    const res = (await get(admin)).body;
    expect(res.database.percent).toBeGreaterThan(95);
    expect(res.database.level).toBe('alert');
    expect(res.warnings).toEqual([{ source: 'database', level: 'alert' }]);
  });

  it('levels: ok below 80 %, warn from 80, alert from 95', () => {
    const { levelOf } = storage();
    expect([levelOf(79.9), levelOf(80), levelOf(94.9), levelOf(95), levelOf(null)]).toEqual(['ok', 'warn', 'warn', 'alert', 'unknown']);
  });

  it('Cloudinary: its credits when set up; asked at most every 10 minutes; a failure is shown, not thrown', async () => {
    const usage = jest.fn(async () => ({
      plan: 'Free', credits: { usage: 21, limit: 25, used_percent: 84 }, storage: { usage: 900000 }, bandwidth: { usage: 5000 }, objects: { usage: 42 }
    }));
    withCloudinary(usage);
    // Once through the route (the wiring and the warning)...
    const res = (await get(admin)).body;
    expect(res.cloudinary).toEqual({
      configured: true, plan: 'Free', creditsUsed: 21, creditsLimit: 25, percent: 84, level: 'warn',
      storageBytes: 900000, bandwidthBytes: 5000, objects: 42
    });
    expect(res.warnings).toEqual([{ source: 'cloudinary', level: 'warn' }]);
    // ...the rest on the service: each report also measures the database,
    // which is slow-ish on the local test cluster.
    const { cloudinaryUsage } = storage();
    const t0 = Date.now();
    await cloudinaryUsage({ now: t0 + 9 * 60 * 1000 });
    expect(usage).toHaveBeenCalledTimes(1);
    await cloudinaryUsage({ now: t0 + 11 * 60 * 1000 });
    expect(usage).toHaveBeenCalledTimes(2);
    // Without its own percent, worked out from usage / limit.
    storage().resetCache();
    cloudinary().api.usage = jest.fn(async () => ({ credits: { usage: 24, limit: 25 } }));
    expect(await cloudinaryUsage()).toMatchObject({ percent: 96, level: 'alert' });
    storage().resetCache();
    cloudinary().api.usage = jest.fn(async () => { throw new Error('rate limited'); });
    expect(await cloudinaryUsage()).toEqual({ configured: true, error: 'unavailable', level: 'unknown' });
  });

  it('uploads in the last 24 hours, and the top uploaders', async () => {
    // The smaller uploader joined first: the order is by bytes, not id.
    const small = await registerAndLogin(app);
    const big = await registerAndLogin(app);
    await pool.query(
      `INSERT INTO media_uploads (user_id, kind, bytes, created_at) VALUES
         ($1, 'image', 3000, now()), ($1, 'image', 2000, now()), ($2, 'audio', 1000, now()), ($2, 'image', 99999, now() - interval '2 days')`,
      [big.id, small.id]
    );
    const res = (await get(admin)).body.uploads;
    expect(res).toEqual({
      files: 3, bytes: 6000,
      topUploaders: [
        { id: big.id, username: big.username, files: 2, bytes: 5000 },
        { id: small.id, username: small.username, files: 1, bytes: 1000 }
      ]
    });
  });
});
