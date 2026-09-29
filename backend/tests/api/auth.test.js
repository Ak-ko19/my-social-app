const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { uniqueUser, registerAndLogin } = require('../helpers/auth');

describe('auth', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  describe('POST /signup', () => {
    it('creates a new user', async () => {
      const creds = uniqueUser();
      const res = await request(app).post('/signup').send(creds);
      expect(res.status).toBe(201);
      expect(res.body.username).toBe(creds.username);
      expect(res.body.email).toBe(creds.email);
      expect(res.body.password).toBeUndefined();
    });

    it('rejects a duplicate email', async () => {
      const creds = uniqueUser();
      await request(app).post('/signup').send(creds);
      const res = await request(app).post('/signup').send(uniqueUser({ email: creds.email }));
      expect(res.status).toBe(400);
    });

    it('rejects a missing password', async () => {
      const creds = uniqueUser();
      delete creds.password;
      const res = await request(app).post('/signup').send(creds);
      expect(res.status).toBe(400);
    });

    it('rejects an invalid email format', async () => {
      const res = await request(app).post('/signup').send(uniqueUser({ email: 'not-an-email' }));
      expect(res.status).toBe(400);
    });
  });

  describe('POST /login', () => {
    it('logs in with correct credentials and returns a token', async () => {
      const creds = uniqueUser();
      await request(app).post('/signup').send(creds);
      const res = await request(app).post('/login').send({ email: creds.email, password: creds.password });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.email).toBe(creds.email);
    });

    it('rejects a wrong password', async () => {
      const creds = uniqueUser();
      await request(app).post('/signup').send(creds);
      const res = await request(app).post('/login').send({ email: creds.email, password: 'wrong-password' });
      expect(res.status).toBe(401);
    });

    it('rejects a nonexistent email the same way as a wrong password (no user enumeration)', async () => {
      const res = await request(app).post('/login').send({ email: 'nobody@example.com', password: 'whatever123' });
      expect(res.status).toBe(401);
    });
  });

  describe('auth-required routes without a token', () => {
    it('rejects with 401 when no Authorization header is sent', async () => {
      const res = await request(app).get('/profile/me');
      expect(res.status).toBe(401);
    });

    it('rejects with 401 when the token is garbage', async () => {
      const res = await request(app).get('/profile/me').set('Authorization', 'Bearer not-a-real-token');
      expect(res.status).toBe(401);
    });
  });

  describe('account lifecycle', () => {
    it('deactivates on request and reactivates automatically on next login', async () => {
      const user = await registerAndLogin(app);

      const deactivateRes = await request(app)
        .post('/profile/deactivate')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: user.password });
      expect(deactivateRes.status).toBe(200);

      const loginRes = await request(app).post('/login').send({ email: user.email, password: user.password });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.reactivated).toBe(true);
    });

    it('hard-deletes the account and cascades their posts', async () => {
      const user = await registerAndLogin(app);
      await request(app)
        .post('/posts')
        .set('Authorization', `Bearer ${user.token}`)
        .field('content', 'a post that should disappear with its author');

      const deleteRes = await request(app)
        .delete('/profile')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: user.password });
      expect(deleteRes.status).toBe(200);

      // The token is still validly signed, but its account (and session,
      // by cascade) is gone: since Day 8 authMiddleware checks the session
      // in the database, so it's rejected as a dead token (401 -> the
      // frontend signs that device out) instead of reaching the route.
      const meRes = await request(app).get('/profile/me').set('Authorization', `Bearer ${user.token}`);
      expect(meRes.status).toBe(401);
      const posts = await request(app).get('/posts');
      expect(posts.body.posts.find((p) => p.content === 'a post that should disappear with its author')).toBeUndefined();
    });
  });
});
