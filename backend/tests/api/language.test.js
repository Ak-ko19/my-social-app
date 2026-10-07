const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { uniqueUser, registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 16: the app language is saved per account (migration 033), so it
// follows the person to every device. Owner decision 2026-10-07: English
// and Arabic only (migration 051).
describe('per-account app language (Day 16)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const login = (creds) => request(app).post('/login').send({ email: creds.email, password: creds.password });

  it('is null until chosen, then comes back from /profile/me and every login', async () => {
    const user = await registerAndLogin(app);
    expect((await request(app).get('/profile/me').set(auth(user))).body.language).toBeNull();
    expect((await login(user)).body.language).toBeNull();

    const res = await request(app).put('/profile/language').set(auth(user)).send({ language: 'ar' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'ar' });
    expect((await request(app).get('/profile/me').set(auth(user))).body.language).toBe('ar');
    expect((await login(user)).body.language).toBe('ar');
  });

  it('accepts only the app\'s languages', async () => {
    const user = await registerAndLogin(app);
    for (const language of [undefined, null, '', 'fr', 'my', 'AR', 'ar ', 42, ['ar'], { ar: true }]) {
      const res = await request(app).put('/profile/language').set(auth(user)).send({ language });
      expect(res.status).toBe(400);
      expect(res.text).toBe('language must be one of: en, ar');
    }
    expect((await request(app).put('/profile/language').set(auth(user)).send()).status).toBe(400); // no body at all
  });

  it('needs a login, and only ever changes your own account', async () => {
    expect((await request(app).put('/profile/language').send({ language: 'ar' })).status).toBe(401);
    // b first, so a is not user 1 (an update hard-wired to one id can't pass).
    const b = await registerAndLogin(app);
    const a = await registerAndLogin(app);
    await request(app).put('/profile/language').set(auth(a)).send({ language: 'ar' });
    expect((await request(app).get('/profile/me').set(auth(a))).body.language).toBe('ar');
    expect((await request(app).get('/profile/me').set(auth(b))).body.language).toBeNull();
  });

  it('signup keeps the language the app was in; anything unknown is ignored, never an error', async () => {
    const ar = uniqueUser();
    expect((await request(app).post('/signup').send({ ...ar, language: 'ar' })).status).toBe(201);
    expect((await login(ar)).body.language).toBe('ar');

    // Myanmar is no longer a UI language: ignored like any unknown value.
    const my = uniqueUser();
    expect((await request(app).post('/signup').send({ ...my, language: 'my' })).status).toBe(201);
    expect((await login(my)).body.language).toBeNull();

    const odd = uniqueUser();
    const res = await request(app).post('/signup').send({ ...odd, language: 'klingon' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'username']);
    expect((await login(odd)).body.language).toBeNull();
  });
  it('the database refuses Myanmar too (migration 051)', async () => {
    const user = await registerAndLogin(app);
    await expect(pool.query("UPDATE users SET language = 'my' WHERE id = $1", [user.id])).rejects.toThrow(/chk_users_language/);
  });

  it('migration 051 moves Myanmar accounts to English and keeps the others', async () => {
    const sql = (dir) => fs.readFileSync(path.join(__dirname, '../../migrations', `051_drop_myanmar_ui_language.${dir}.sql`), 'utf8');
    const [my, ar, none] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    await pool.query(sql('down')); // the 033 constraint: 'my' allowed again
    await pool.query("UPDATE users SET language = 'my' WHERE id = $1", [my.id]);
    await pool.query("UPDATE users SET language = 'ar' WHERE id = $1", [ar.id]);

    await pool.query(sql('up'));
    const rows = (await pool.query('SELECT id, language FROM users WHERE id = ANY($1) ORDER BY id', [[my.id, ar.id, none.id]])).rows;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.language]))).toEqual({ [my.id]: 'en', [ar.id]: 'ar', [none.id]: null });
    expect((await login(my)).body.language).toBe('en');
    await expect(pool.query("UPDATE users SET language = 'my' WHERE id = $1", [none.id])).rejects.toThrow(/chk_users_language/);
  });

  it('is not shown on other people\'s profiles', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    await request(app).put('/profile/language').set(auth(a)).send({ language: 'ar' });
    expect((await request(app).get(`/profile/${a.id}`).set(auth(b))).body).not.toHaveProperty('language');
  });
});
