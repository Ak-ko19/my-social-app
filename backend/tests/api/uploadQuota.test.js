const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 57 step 2: a daily upload budget per person (migration 067's
// media_uploads ledger), checked before anything goes to Cloudinary.
describe('upload limits (Day 57)', () => {
  const { app, reset } = setupTestApp();
  const saved = { files: process.env.UPLOAD_LIMIT_FILES_PER_DAY, mb: process.env.UPLOAD_LIMIT_MB_PER_DAY };
  beforeEach(async () => {
    delete process.env.UPLOAD_LIMIT_FILES_PER_DAY;
    delete process.env.UPLOAD_LIMIT_MB_PER_DAY;
    await reset();
  });
  afterAll(() => {
    for (const [k, v] of [['UPLOAD_LIMIT_FILES_PER_DAY', saved.files], ['UPLOAD_LIMIT_MB_PER_DAY', saved.mb]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex'); // 8 bytes
  const post = (user, n) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', 'pics');
    for (let i = 0; i < n; i += 1) req = req.attach('images', png, { filename: `${i}.png`, contentType: 'image/png' });
    return req;
  };
  const story = (user) => request(app).post('/stories').set(auth(user)).attach('image', png, { filename: 's.png', contentType: 'image/png' });
  const ledger = async (user) => (await pool.query('SELECT kind, bytes FROM media_uploads WHERE user_id = $1 ORDER BY id', [user.id])).rows
    .map((r) => [r.kind, Number(r.bytes)]);

  it('records each stored file with its size', async () => {
    const me = await registerAndLogin(app);
    expect((await post(me, 2)).status).toBe(201);
    expect((await story(me)).status).toBe(201);
    expect(await ledger(me)).toEqual([['image', 8], ['image', 8], ['image', 8]]);
    const exported = (await request(app).get('/profile/export').set(auth(me))).body.recent_uploads;
    expect(exported.map((u) => [u.kind, Number(u.bytes)])).toEqual([['image', 8], ['image', 8], ['image', 8]]);
    const textOnly = await request(app).post('/posts').set(auth(me)).field('content', 'no photo');
    expect(textOnly.status).toBe(201);
    expect(await ledger(me)).toHaveLength(3);
  });

  it('refuses what would go over today\'s files, before uploading anything', async () => {
    process.env.UPLOAD_LIMIT_FILES_PER_DAY = '3';
    const me = await registerAndLogin(app);
    expect((await post(me, 2)).status).toBe(201);
    const cloudinary = require('../../config/cloudinary');
    const spy = jest.spyOn(cloudinary.uploader, 'upload_stream');
    try {
      const over = await post(me, 2);
      expect(over.status).toBe(429);
      expect(over.text).toBe("You've reached today's upload limit. Please try again tomorrow.");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect((await post(me, 1)).status).toBe(201); // exactly the limit is fine
    expect((await story(me)).status).toBe(429); // and every upload route counts
    // Someone else has their own budget.
    const other = await registerAndLogin(app);
    expect((await post(other, 2)).status).toBe(201);
  });

  it('counts bytes too, and only the last 24 hours', async () => {
    process.env.UPLOAD_LIMIT_MB_PER_DAY = '1';
    const me = await registerAndLogin(app);
    await pool.query("INSERT INTO media_uploads (user_id, kind, bytes) VALUES ($1, 'image', $2)", [me.id, 1024 * 1024 - 10]);
    expect((await post(me, 2)).status).toBe(429); // 16 more bytes would pass 1 MB
    expect((await post(me, 1)).status).toBe(201); // 8 fit
    await pool.query("UPDATE media_uploads SET created_at = now() - interval '25 hours' WHERE user_id = $1", [me.id]);
    expect((await post(me, 2)).status).toBe(201);
  });

  it('a bad limit setting falls back to the default', async () => {
    process.env.UPLOAD_LIMIT_FILES_PER_DAY = 'lots';
    const { limits } = require('../../services/uploadQuotaService');
    expect(limits()).toEqual({ files: 100, bytes: 300 * 1024 * 1024 });
    process.env.UPLOAD_LIMIT_FILES_PER_DAY = '-5';
    process.env.UPLOAD_LIMIT_MB_PER_DAY = '0';
    expect(limits()).toEqual({ files: 100, bytes: 300 * 1024 * 1024 });
  });

  // The message comes from a constant check:i18n can't see, so this checks
  // the app has its Arabic.
  it('the limit message has an Arabic version', () => {
    const { TOO_MANY } = require('../../services/uploadQuotaService');
    const table = require('fs').readFileSync(require('path').join(__dirname, '../../../frontend/src/i18n/serverMessages.ar.js'), 'utf8');
    expect(table).toContain(JSON.stringify(TOO_MANY));
  });

  it('the daily cleanup drops ledger rows older than 30 days', async () => {
    const me = await registerAndLogin(app);
    await pool.query(
      `INSERT INTO media_uploads (user_id, kind, bytes, created_at) VALUES ($1, 'image', 5, now() - interval '31 days'), ($1, 'image', 6, now())`,
      [me.id]
    );
    const cleanup = require('../../services/cleanupService');
    expect((await cleanup.run({ dryRun: true })).uploadLedger).toBe(1);
    expect((await cleanup.run()).uploadLedger).toBe(1);
    expect(await ledger(me)).toEqual([['image', 6]]);
  });
});
