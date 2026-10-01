const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { uniqueUser, registerAndLogin } = require('../helpers/auth');

// Day 16: the app language is saved per account (migration 033), so it
// follows the person to every device.
describe('per-account app language (Day 16)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const login = (creds) => request(app).post('/login').send({ email: creds.email, password: creds.password });

  it('is null until chosen, then comes back from /profile/me and every login', async () => {
    const user = await registerAndLogin(app);
    expect((await request(app).get('/profile/me').set(auth(user))).body.language).toBeNull();
    expect((await login(user)).body.language).toBeNull();

    const res = await request(app).put('/profile/language').set(auth(user)).send({ language: 'my' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'my' });
    expect((await request(app).get('/profile/me').set(auth(user))).body.language).toBe('my');
    expect((await login(user)).body.language).toBe('my');
  });

  it('accepts only the app\'s languages', async () => {
    const user = await registerAndLogin(app);
    for (const language of [undefined, null, '', 'fr', 'MY', 'my ', 42, ['my'], { my: true }]) {
      const res = await request(app).put('/profile/language').set(auth(user)).send({ language });
      expect(res.status).toBe(400);
      expect(res.text).toBe('language must be one of: en, my, ar');
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
    const my = uniqueUser();
    expect((await request(app).post('/signup').send({ ...my, language: 'my' })).status).toBe(201);
    expect((await login(my)).body.language).toBe('my');

    const odd = uniqueUser();
    const res = await request(app).post('/signup').send({ ...odd, language: 'klingon' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'username']);
    expect((await login(odd)).body.language).toBeNull();
  });

  it('is not shown on other people\'s profiles', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    await request(app).put('/profile/language').set(auth(a)).send({ language: 'ar' });
    expect((await request(app).get(`/profile/${a.id}`).set(auth(b))).body).not.toHaveProperty('language');
  });
});
