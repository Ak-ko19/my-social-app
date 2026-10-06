const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 36: a profile's cover photo -- set, replaced, removed; the old file
// is deleted each time, and with the account.
describe('cover photo (Day 36)', () => {
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
  const setCover = (user, file = png, type = 'image/png') =>
    request(app).put('/profile/cover').set(auth(user)).attach('cover', file, { filename: 'c.png', contentType: type });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const deletedIds = () => cloudinary.api.delete_resources.mock.calls.flatMap(([ids]) => ids);
  const idOf = (url) => url.match(/upload\/v\d+\/(.+)\.\w+$/)[1];

  it('sets a cover that everyone (and a logged-out visitor) sees', async () => {
    const me = await registerAndLogin(app);
    const res = await setCover(me);
    expect(res.status).toBe(200);
    expect(res.body.cover_url).toMatch(/^https:\/\/res\.cloudinary\.com\/test\/image\/upload\/v\d+\/covers\//);
    expect((await request(app).get(`/profile/${me.id}`)).body.cover_url).toBe(res.body.cover_url);
    expect((await request(app).get('/profile/me').set(auth(me))).body.cover_url).toBe(res.body.cover_url);
  });

  it('replacing and removing delete the old file', async () => {
    const me = await registerAndLogin(app);
    const first = (await setCover(me)).body.cover_url;
    const second = (await setCover(me)).body.cover_url;
    await settle();
    expect(deletedIds()).toEqual([idOf(first)]);
    const removed = await request(app).delete('/profile/cover').set(auth(me));
    expect(removed.body).toEqual({ cover_url: null });
    await settle();
    expect(deletedIds()).toEqual([idOf(first), idOf(second)]);
  });

  it('needs a login and an image', async () => {
    expect((await request(app).put('/profile/cover').attach('cover', png, { filename: 'c.png', contentType: 'image/png' })).status).toBe(401);
    expect((await request(app).delete('/profile/cover')).status).toBe(401);
    const me = await registerAndLogin(app);
    expect((await request(app).put('/profile/cover').set(auth(me))).status).toBe(400);
    expect((await setCover(me, Buffer.from('#!/bin/sh'), 'text/x-sh')).status).toBe(400);
  });

  it('deleting the account deletes the cover too', async () => {
    const me = await registerAndLogin(app);
    const cover = (await setCover(me)).body.cover_url;
    await request(app).delete('/profile').set(auth(me)).send({ password: me.password });
    await settle();
    expect(deletedIds()).toContain(idOf(cover));
  });

  it('the data download includes it', async () => {
    const me = await registerAndLogin(app);
    const cover = (await setCover(me)).body.cover_url;
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(me))).text);
    expect(data.profile.cover_url).toBe(cover);
  });
});
