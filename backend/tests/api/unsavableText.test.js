const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 75: Postgres refuses a NUL character in text. Anywhere it is sent --
// logged in or not, JSON or a form, a body or a search -- that is a 400 the
// person can act on, never a server error (which anyone could otherwise use
// to fill Admin > Errors).
describe('a NUL character in text', () => {
  const { app, reset } = setupTestApp();
  const errorLog = require('../../services/errorLogService');
  beforeEach(async () => {
    await reset();
    errorLog.resetThrottle();
  });
  const NUL = 'a\u0000b';
  const MESSAGE = "This text contains a character that can't be saved.";

  it('is a 400 with a clear message on every kind of route, and nothing is logged as an error', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const auth = { Authorization: `Bearer ${a.token}` };
    const post = (await request(app).post('/posts').set(auth).field('content', 'fine')).body;
    const conv = (await request(app).post('/conversations').set(auth).send({ userId: b.id })).body;

    const answers = {
      'login (no account needed)': await request(app).post('/login').send({ email: NUL, password: NUL }),
      'signup': await request(app).post('/signup').send({ username: 'x\u0000y', email: 'nul@example.com', password: 'a-fine-password-1' }),
      'post (form)': await request(app).post('/posts').set(auth).field('content', NUL),
      'comment': await request(app).post(`/posts/${post.id}/comments`).set(auth).send({ content: NUL }),
      'message': await request(app).post(`/conversations/${conv.id}/messages`).set(auth).send({ content: NUL }),
      'search (query)': await request(app).get('/search/posts').query({ q: NUL }).set(auth),
      'group': await request(app).post('/communities').set(auth).send({ name: NUL })
    };
    for (const [where, res] of Object.entries(answers)) {
      expect([where, res.status, res.text]).toEqual([where, 400, MESSAGE]);
    }

    await new Promise((resolve) => setTimeout(resolve, 30));
    await errorLog.whenIdle();
    expect((await pool.query('SELECT count(*)::int AS n FROM error_groups')).rows[0].n).toBe(0);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
