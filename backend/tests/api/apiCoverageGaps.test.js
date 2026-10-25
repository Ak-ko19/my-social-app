const crypto = require('crypto');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 68: the API operations no other test reached (the coverage report
// in globalTeardown), so their responses are checked against the spec too.
describe('API operations no other test reached', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  describe('GET /verify-email/:token', () => {
    const setToken = (userId, token, expiry) => pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expiry = $2 WHERE id = $3',
      [crypto.createHash('sha256').update(token).digest('hex'), expiry, userId]
    );
    const verified = async (userId) => (await pool.query('SELECT email_verified FROM users WHERE id = $1', [userId])).rows[0].email_verified;

    it('verifies the address with a good link, once', async () => {
      const user = await registerAndLogin(app);
      await setToken(user.id, 'good-token', new Date(Date.now() + 60 * 60 * 1000));
      const res = await request(app).get('/verify-email/good-token');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(await verified(user.id)).toBe(true);
      expect((await request(app).get('/verify-email/good-token')).status).toBe(400); // used up
    });

    it('refuses an unknown or expired link', async () => {
      const user = await registerAndLogin(app);
      await setToken(user.id, 'old-token', new Date(Date.now() - 1000));
      expect((await request(app).get('/verify-email/old-token')).status).toBe(400);
      expect((await request(app).get('/verify-email/no-such-token')).status).toBe(400);
      expect(await verified(user.id)).toBe(false);
    });
  });

  describe('notifications: unread count, read one, read all', () => {
    it('counts, marks one read, then all; only your own', async () => {
      const alice = await registerAndLogin(app);
      const bob = await registerAndLogin(app);
      const carol = await registerAndLogin(app);
      await request(app).post(`/users/${alice.id}/follow`).set(auth(bob));
      await request(app).post(`/users/${alice.id}/follow`).set(auth(carol));
      const count = async () => (await request(app).get('/notifications/unread-count').set(auth(alice))).body.unreadCount;
      expect(await count()).toBe(2);

      const [first] = (await request(app).get('/notifications').set(auth(alice))).body.notifications;
      expect((await request(app).put(`/notifications/${first.id}/read`).set(auth(bob))).status).toBe(404); // not bob's
      const read = await request(app).put(`/notifications/${first.id}/read`).set(auth(alice));
      expect(read.status).toBe(200);
      // Day 81: both follows are one row (same day), so both are read.
      expect(read.body).toMatchObject({ id: first.id, is_read: true, marked: 2 });
      expect(await count()).toBe(0);
      // A new follower (since Day 91 carol following again the same day is
      // not news twice).
      const dan = await registerAndLogin(app);
      await request(app).post(`/users/${alice.id}/follow`).set(auth(dan));
      expect(await count()).toBe(1);

      expect((await request(app).put('/notifications/abc/read').set(auth(alice))).status).toBe(400);
      expect((await request(app).put('/notifications/read-all').set(auth(alice))).status).toBe(200);
      expect(await count()).toBe(0);
      expect((await request(app).get('/notifications/unread-count')).status).toBe(401);
    });
  });

  describe('POST /conversations/:id/messages/voice', () => {
    it('sends a voice note to a participant chat; refuses outsiders and missing files', async () => {
      const alice = await registerAndLogin(app);
      const bob = await registerAndLogin(app);
      const outsider = await registerAndLogin(app);
      const conv = (await request(app).post('/conversations').set(auth(alice)).send({ userId: bob.id })).body;
      const audio = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.from('fake webm audio')]); // a WebM start

      const sent = await request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(alice))
        .attach('audio', audio, { filename: 'note.webm', contentType: 'audio/webm' })
        .field('clientTempId', 'tmp-1');
      expect(sent.status).toBe(201);
      expect(sent.body).toMatchObject({ type: 'voice', sender_id: alice.id, duration_seconds: 3, client_temp_id: 'tmp-1' });
      expect(sent.body.media_url).toMatch(/\.mp3$/);

      expect((await request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(alice))).status).toBe(400);
      const wrongType = await request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(alice))
        .attach('audio', audio, { filename: 'x.png', contentType: 'image/png' });
      expect(wrongType.status).toBe(400);
      const outside = await request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(outsider))
        .attach('audio', audio, { filename: 'note.webm', contentType: 'audio/webm' });
      expect(outside.status).toBe(403);
    });
  });
});
