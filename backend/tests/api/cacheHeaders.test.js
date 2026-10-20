const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 74: no API answer is kept by the browser unless its route allows it
// (middleware/cacheControl.js); the shared, public ones revalidate by ETag.
describe('Cache-Control on API answers', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('marks personal answers no-store: lists, one post, the login itself', async () => {
    const user = await registerAndLogin(app);
    const auth = { Authorization: `Bearer ${user.token}` };
    const post = await request(app).post('/posts').set(auth).field('content', 'cache check');
    for (const path of ['/feed', '/notifications', '/conversations', '/profile/me', `/posts/${post.body.id}`]) {
      const res = await request(app).get(path).set(auth);
      expect([path, res.status]).toEqual([path, 200]);
      expect([path, res.headers['cache-control']]).toEqual([path, 'no-store']);
    }
    const login = await request(app).post('/login').send({ email: user.email, password: user.password });
    expect(login.headers['cache-control']).toBe('no-store');
  });

  it('marks refusals and errors no-store too', async () => {
    const noToken = await request(app).get('/feed');
    expect(noToken.status).toBe(401);
    expect(noToken.headers['cache-control']).toBe('no-store');
    const missing = await request(app).get('/no-such-route');
    expect(missing.status).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
  });

  it('lets public, shared answers be cached, and answers a repeat with 304', async () => {
    const first = await request(app).get('/config');
    expect(first.headers['cache-control']).toBe('public, max-age=300');
    expect(first.headers.etag).toBeTruthy();
    const again = await request(app).get('/config').set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);
    expect(again.text).toBeFalsy();

    const spec = await request(app).get('/openapi.json');
    expect(spec.headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/openapi.json').set('If-None-Match', spec.headers.etag)).status).toBe(304);
  });
});
