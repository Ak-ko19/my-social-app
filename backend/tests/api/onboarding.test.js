const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 78: the first-run steps -- who still needs them, marking them done,
// and the photo-only upload they use.
describe('onboarding (Day 78)', () => {
  const { app, reset } = setupTestApp();
  const cloudinary = require('../../config/cloudinary'); // the setupTestApp mock
  const CLOUD_ENV = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
  const saved = {};
  beforeAll(() => { for (const [k, v] of Object.entries(CLOUD_ENV)) { saved[k] = process.env[k]; process.env[k] = v; } });
  afterAll(() => { for (const k of Object.keys(CLOUD_ENV)) process.env[k] = saved[k]; });
  beforeEach(async () => {
    await reset();
    cloudinary.api.delete_resources.mockClear();
  });

  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const login = (user) => request(app).post('/login').send({ email: user.email, password: user.password });
  const me = (user) => request(app).get('/profile/me').set(auth(user));
  const done = (user) => request(app).post('/profile/onboarding/done').set(auth(user));
  const setAvatar = (user, file = png) => request(app).put('/profile/avatar').set(auth(user)).attach('avatar', file, { filename: 'a.png', contentType: 'image/png' });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('a new account needs the first-run steps until it says it is done, once', async () => {
    const user = await registerAndLogin(app);
    expect((await login(user)).body.needsOnboarding).toBe(true);
    expect((await me(user)).body.onboarded_at).toBeNull();

    const first = await done(user);
    expect(first.status).toBe(200);
    expect(new Date(first.body.onboarded_at).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect((await login(user)).body.needsOnboarding).toBe(false);
    expect((await me(user)).body.onboarded_at).toBe(first.body.onboarded_at);
    // Again: the first time is kept.
    expect((await done(user)).body.onboarded_at).toBe(first.body.onboarded_at);
  });

  it('is per account', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    await done(a);
    expect((await login(b)).body.needsOnboarding).toBe(true);
  });

  it('needs a login', async () => {
    expect((await request(app).post('/profile/onboarding/done')).status).toBe(401);
    expect((await request(app).put('/profile/avatar').attach('avatar', png, { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
  });

  it('the photo-only upload changes the photo and nothing else, and drops the old file', async () => {
    const user = await registerAndLogin(app);
    await pool.query("UPDATE users SET bio = 'Hello there', links = '{https://example.com}' WHERE id = $1", [user.id]);
    expect((await request(app).put('/profile/avatar').set(auth(user))).text).toBe('Choose a photo');
    const first = await setAvatar(user);
    expect(first.status).toBe(200);
    expect(first.body.avatar_url).toMatch(/^https:\/\/res\.cloudinary\.com\/test\/image\/upload\/v\d+\/avatars\//);
    const profile = (await me(user)).body;
    expect(profile).toMatchObject({ avatar_url: first.body.avatar_url, bio: 'Hello there', links: ['https://example.com'] });

    const second = (await setAvatar(user)).body.avatar_url;
    await settle();
    const deleted = cloudinary.api.delete_resources.mock.calls.flatMap(([ids]) => ids);
    expect(deleted).toEqual([first.body.avatar_url.match(/upload\/v\d+\/(.+)\.\w+$/)[1]]);
    expect((await me(user)).body.avatar_url).toBe(second);
  });

  it('refuses a file that is not a photo', async () => {
    const user = await registerAndLogin(app);
    const res = await setAvatar(user, Buffer.from('not a picture at all'));
    expect(res.status).toBe(400);
    expect((await me(user)).body.avatar_url).toBeNull();
  });

  it('the data export says when the steps were done', async () => {
    const user = await registerAndLogin(app);
    await done(user);
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(user))).text);
    expect(data.profile.onboarded_at).toBeTruthy();
  });
});
