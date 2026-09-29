const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 8: every login is a session (migration 028); changing the password
// signs out every OTHER device, resetting it signs out all of them.
describe('sessions', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const me = (token) => request(app).get('/profile/me').set(auth(token));
  const loginAgain = async (user, userAgent = 'Device B') => (await request(app).post('/login')
    .set('User-Agent', userAgent).send({ email: user.email, password: user.password })).body.token;
  const changePassword = (token, currentPassword, newPassword = 'a-brand-new-password-456') =>
    request(app).put('/profile/password').set(auth(token)).send({ currentPassword, newPassword });
  // A token from before sessions existed: no "sid" claim, issued earlier.
  const legacyToken = (userId, secondsAgo = 60) =>
    jwt.sign({ userId, iat: Math.floor(Date.now() / 1000) - secondsAgo }, process.env.JWT_SECRET, { expiresIn: '7d' });

  it('every login creates a session, and the token carries its id', async () => {
    const user = await registerAndLogin(app);
    const second = await loginAgain(user, 'Mozilla/5.0 (iPhone)');
    const { sid } = jwt.decode(second);
    const row = (await pool.query('SELECT user_id, user_agent, revoked_at, expires_at > now() + interval \'6 days\' AS long_enough FROM sessions WHERE id = $1', [sid])).rows[0];
    expect(row).toEqual({ user_id: user.id, user_agent: 'Mozilla/5.0 (iPhone)', revoked_at: null, long_enough: true });
    expect((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [user.id])).rows[0].n).toBe(2);
    expect((await me(second)).status).toBe(200);
  });

  describe('changing the password', () => {
    it('signs out the other devices; this one stays signed in', async () => {
      const user = await registerAndLogin(app); // device A
      const deviceB = await loginAgain(user);
      const res = await changePassword(user.token, user.password);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Password changed successfully' }); // no new token needed
      expect((await me(user.token)).status).toBe(200);
      const b = await me(deviceB);
      expect(b.status).toBe(401);
      expect(b.text).toBe('Invalid or expired token');
      // The new password works for a fresh sign-in; the old one doesn't.
      expect((await request(app).post('/login').send({ email: user.email, password: 'a-brand-new-password-456' })).status).toBe(200);
      expect((await request(app).post('/login').send({ email: user.email, password: user.password })).status).toBe(401);
    });

    it('also cuts off tokens from before sessions existed', async () => {
      const user = await registerAndLogin(app);
      const old = legacyToken(user.id);
      expect((await me(old)).status).toBe(200); // deploying sessions logs nobody out
      await changePassword(user.token, user.password);
      expect((await me(old)).status).toBe(401);
    });

    it('from a pre-sessions token: this device gets a fresh token that works', async () => {
      const user = await registerAndLogin(app);
      const old = legacyToken(user.id);
      const res = await changePassword(old, user.password);
      expect(res.status).toBe(200);
      expect(jwt.decode(res.body.token).sid).toEqual(expect.any(String));
      expect((await me(old)).status).toBe(401);
      expect((await me(res.body.token)).status).toBe(200);
      expect((await me(user.token)).status).toBe(401); // the other device
    });

    it('a mistyped current password is 403 (the app logs out on 401) and changes nothing', async () => {
      const user = await registerAndLogin(app);
      const deviceB = await loginAgain(user);
      const res = await changePassword(user.token, 'not-my-password');
      expect(res.status).toBe(403);
      expect(res.text).toBe('Current password is incorrect');
      expect((await me(user.token)).status).toBe(200);
      expect((await me(deviceB)).status).toBe(200);
    });
  });

  it('a wrong password on deactivate or delete is 403 too', async () => {
    const user = await registerAndLogin(app);
    const deactivate = await request(app).post('/profile/deactivate').set(auth(user.token)).send({ password: 'wrong-password' });
    const del = await request(app).delete('/profile').set(auth(user.token)).send({ password: 'wrong-password' });
    expect([deactivate.status, del.status]).toEqual([403, 403]);
    expect((await me(user.token)).status).toBe(200);
  });

  it('resetting a forgotten password signs out every device', async () => {
    const user = await registerAndLogin(app);
    const deviceB = await loginAgain(user);
    const old = legacyToken(user.id);
    const logs = jest.spyOn(console, 'log').mockImplementation(() => {});
    await request(app).post('/forgot-password').send({ email: user.email });
    const link = logs.mock.calls.flat().join('\n').match(/reset-password\/([a-f0-9]{64})/);
    logs.mockRestore();
    expect((await request(app).post(`/reset-password/${link[1]}`).send({ password: 'reset-password-789' })).status).toBe(200);
    for (const token of [user.token, deviceB, old]) expect((await me(token)).status).toBe(401);
    expect((await request(app).post('/login').send({ email: user.email, password: 'reset-password-789' })).status).toBe(200);
  });

  it('rejects revoked, expired, unknown and malformed sessions without erroring', async () => {
    const user = await registerAndLogin(app);
    const { sid } = jwt.decode(user.token);
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = $1", [sid]);
    expect((await me(user.token)).status).toBe(401);
    const sign = (claims) => jwt.sign({ userId: user.id, ...claims }, process.env.JWT_SECRET, { expiresIn: '1h' });
    for (const token of [
      sign({ sid: '00000000-0000-4000-8000-000000000000' }), // no such session
      sign({ sid: 'not-a-uuid' }),
      sign({ sid: null })
    ]) {
      expect((await me(token)).status).toBe(401);
    }
    // Someone else's session id can't be borrowed either.
    const other = await registerAndLogin(app);
    expect((await me(sign({ sid: jwt.decode(other.token).sid }))).status).toBe(401);
  });

  it('a signed-out device browses public pages as anonymous', async () => {
    const author = await registerAndLogin(app);
    const deviceB = await loginAgain(author);
    const post = (await request(app).post('/posts').set(auth(author.token)).field('content', 'hello')).body;
    await request(app).post(`/posts/${post.id}/like`).set(auth(deviceB));
    const likedBy = async (token) => (await request(app).get(`/posts/${post.id}`).set(auth(token))).body.liked_by_me;
    expect(await likedBy(deviceB)).toBe(true);
    await changePassword(author.token, author.password);
    expect(await likedBy(deviceB)).toBe(false); // anonymous now, not an error
  });

  it('deleting the account removes its sessions', async () => {
    const user = await registerAndLogin(app);
    await loginAgain(user);
    await request(app).delete('/profile').set(auth(user.token)).send({ password: user.password });
    expect((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [user.id])).rows[0].n).toBe(0);
  });

  describe('live sockets', () => {
    let server;
    let url;
    beforeAll(async () => {
      const { initSocket } = require('../../sockets');
      server = http.createServer(app);
      initSocket(server);
      await new Promise((resolve) => server.listen(0, resolve));
      url = `http://localhost:${server.address().port}`;
    });
    afterAll(async () => {
      require('../../sockets').getIO().close();
      await new Promise((resolve) => server.close(resolve));
    });

    const open = (token) => new Promise((resolve, reject) => {
      const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => { socket.close(); reject(err); });
    });

    it('password change disconnects the other devices\' sockets, not this one\'s', async () => {
      const user = await registerAndLogin(app);
      const deviceB = await loginAgain(user);
      const a = await open(user.token);
      const b = await open(deviceB);
      const bGone = new Promise((resolve) => b.on('disconnect', resolve));

      await changePassword(user.token, user.password);
      expect(await bGone).toBe('io server disconnect');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(a.connected).toBe(true);

      // And device B can't come back with its old token.
      const err = await open(deviceB).catch((e) => e);
      expect(err.data).toEqual({ code: 'AUTH_FAILED' });
      a.close();
    });
  });
});
