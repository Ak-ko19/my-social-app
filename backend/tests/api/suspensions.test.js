const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 12 step 2: temporary suspensions (migration 032) and removing
// reported comments and messages.
describe('admin review: suspensions and removing comments/messages (Day 12)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);

  const { pool } = require('../helpers/testDb');
  // Required after setupTestApp(), so it gets the test database too.
  const cleanupService = require('../../services/cleanupService');
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const suspend = (admin, user, body) => request(app).post(`/admin/users/${user.id}/suspend`).set(auth(admin)).send(body);
  const me = (user) => request(app).get('/profile/me').set(auth(user));
  const login = (user) => request(app).post('/login').send({ email: user.email, password: user.password });
  const userRow = async (user) => (await pool.query('SELECT banned_at, banned_until, is_deactivated FROM users WHERE id = $1', [user.id])).rows[0];
  const expire = (user) => pool.query("UPDATE users SET banned_until = now() - interval '1 second' WHERE id = $1 AND banned_until IS NOT NULL", [user.id]);

  let admin;
  let alice;
  let bob;

  beforeEach(async () => {
    admin = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    alice = await registerAndLogin(app);
    bob = await registerAndLogin(app);
  });

  describe('suspend', () => {
    it('only for 1, 3, 7 or 30 days; admins only; not yourself or another admin', async () => {
      for (const days of [undefined, 0, 2, 31, '7x', -1]) {
        const res = await suspend(admin, bob, { days });
        expect(res.status).toBe(400);
        expect(res.text).toBe('days must be one of: 1, 3, 7, 30');
      }
      expect((await suspend(alice, bob, { days: 1 })).status).toBe(404);
      expect((await suspend(admin, admin, { days: 1 })).status).toBe(400);
      await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [alice.id]);
      expect((await suspend(admin, alice, { days: 1 })).status).toBe(400);
    });

    it('locks the account out until then, and says until when at login', async () => {
      const before = Date.now();
      expect((await suspend(admin, bob, { days: 3, reason: 'cool off' })).status).toBe(200);
      const row = await userRow(bob);
      expect(row.is_deactivated).toBe(true); // content hidden meanwhile
      const until = row.banned_until.getTime();
      expect(until).toBeGreaterThanOrEqual(before + 3 * 86400000 - 5000);
      expect(until).toBeLessThanOrEqual(Date.now() + 3 * 86400000 + 5000);

      const req = await me(bob);
      expect(req.status).toBe(401);
      expect(req.text).toBe('This account is suspended');
      const res = await login(bob);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('This account is suspended');
      expect(new Date(res.body.until).getTime()).toBe(until);
    });

    it('refuses the live-chat connection too, as a dead token (the app logs out)', async () => {
      const socketAuth = require('../../sockets/socketAuth');
      const connect = () => new Promise((resolve) => {
        socketAuth({ handshake: { auth: { token: bob.token } }, data: {} }, (err) => resolve(err || null));
      });
      expect(await connect()).toBeNull();
      await suspend(admin, bob, { days: 1 });
      const err = await connect();
      expect(err.message).toBe('This account is suspended');
      expect(err.data).toEqual({ code: 'AUTH_FAILED' });
    });

    it('ends by itself: the next request lifts it and the account is back', async () => {
      await suspend(admin, bob, { days: 1 });
      await expire(bob);
      expect((await me(bob)).status).toBe(200);
      expect(await userRow(bob)).toEqual({ banned_at: null, banned_until: null, is_deactivated: false });
    });

    it('ends by itself at login too (no "welcome back" reactivation notice)', async () => {
      await suspend(admin, bob, { days: 1 });
      await expire(bob);
      const res = await login(bob);
      expect(res.status).toBe(200);
      expect(res.body.reactivated).toBe(false);
      expect((await userRow(bob)).banned_at).toBeNull();
    });

    it('the daily cleanup job lifts suspensions of people who have not come back', async () => {
      await suspend(admin, bob, { days: 1 });
      await suspend(admin, alice, { days: 7 });
      await expire(bob);
      expect((await cleanupService.run({ dryRun: true })).suspensionsLifted).toBe(1);
      expect((await cleanupService.run()).suspensionsLifted).toBe(1);
      expect((await userRow(bob)).banned_at).toBeNull();
      expect((await userRow(alice)).banned_until).not.toBeNull(); // still running
    });

    it('a ban overrides a suspension (permanent), a suspension can shorten a ban, and unban lifts either', async () => {
      await suspend(admin, bob, { days: 1 });
      await request(app).post(`/admin/users/${bob.id}/ban`).set(auth(admin));
      expect((await userRow(bob)).banned_until).toBeNull();
      await expire(bob); // nothing to expire: stays banned
      expect((await me(bob)).text).toBe('This account has been banned');

      await suspend(admin, bob, { days: 1 });
      expect((await userRow(bob)).banned_until).not.toBeNull();
      expect((await request(app).post(`/admin/users/${bob.id}/unban`).set(auth(admin))).status).toBe(200);
      expect(await userRow(bob)).toEqual({ banned_at: null, banned_until: null, is_deactivated: false });
      expect((await login(bob)).status).toBe(200);
    });

    it('resolves pending reports on the person and their content as "user_suspended"', async () => {
      const post = (await request(app).post('/posts').set(auth(bob)).field('content', 'rude')).body;
      await request(app).post('/reports').set(auth(alice)).send({ targetType: 'post', targetId: post.id, reason: 'spam' });
      await request(app).post('/reports').set(auth(alice)).send({ targetType: 'user', targetId: bob.id, reason: 'harassment' });
      await suspend(admin, bob, { days: 7 });
      expect((await request(app).get('/admin/reports').set(auth(admin))).body.reports).toHaveLength(0);
      const reviewed = (await request(app).get('/admin/reports').query({ status: 'reviewed' }).set(auth(admin))).body.reports;
      expect(reviewed.map((r) => r.resolution)).toEqual(['user_suspended', 'user_suspended']);
      expect(reviewed.find((r) => r.target_type === 'user').target_banned_until).not.toBeNull();
    });
  });

  describe('remove reported content', () => {
    const removeFor = async (report) => {
      const created = await request(app).post('/reports').set(auth(alice)).send({ ...report, reason: 'harassment' });
      return request(app).post(`/admin/reports/${created.body.id}/remove-content`).set(auth(admin));
    };

    it('a comment: deleted with its replies, and all its reports resolved', async () => {
      const post = (await request(app).post('/posts').set(auth(alice)).field('content', 'hi')).body;
      const comment = (await request(app).post(`/posts/${post.id}/comments`).set(auth(bob)).send({ content: 'nasty' })).body;
      await request(app).post(`/posts/${post.id}/comments`).set(auth(alice)).send({ content: 'reply', parentCommentId: comment.id });
      await request(app).post('/reports').set(auth(admin)).send({ targetType: 'comment', targetId: comment.id, reason: 'spam' });
      expect((await removeFor({ targetType: 'comment', targetId: comment.id })).status).toBe(200);
      const left = (await request(app).get(`/posts/${post.id}/comments`).set(auth(alice))).body;
      expect(left.find((c) => c.content === 'nasty')).toBeUndefined();
      expect((await request(app).get('/admin/reports').set(auth(admin))).body.reports).toHaveLength(0);
      const reviewed = (await request(app).get('/admin/reports').query({ status: 'reviewed' }).set(auth(admin))).body.reports;
      expect(reviewed.every((r) => r.resolution === 'content_removed')).toBe(true);
      expect(reviewed).toHaveLength(2);
    });

    it('a message: removed like an unsend -- the chat shows it deleted, the text is gone from the API', async () => {
      const conv = (await request(app).post('/conversations').set(auth(alice)).send({ userId: bob.id })).body;
      const message = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(bob)).send({ content: 'threat' })).body;
      expect((await removeFor({ targetType: 'message', targetId: message.id })).status).toBe(200);
      const history = (await request(app).get(`/conversations/${conv.id}/messages`).set(auth(alice))).body;
      const list = Array.isArray(history) ? history : history.messages;
      const removed = list.find((m) => m.id === message.id);
      expect(removed.deleted_at).not.toBeNull();
      expect(JSON.stringify(list)).not.toContain('threat');
      // The admin still sees what was reported.
      const reviewed = (await request(app).get('/admin/reports').query({ status: 'reviewed' }).set(auth(admin))).body.reports;
      expect(reviewed[0]).toMatchObject({ resolution: 'content_removed', target_exists: false, target_snapshot: 'threat' });
    });

    it('an account report cannot be "removed"', async () => {
      const res = await removeFor({ targetType: 'user', targetId: bob.id });
      expect(res.status).toBe(400);
      expect(res.text).toBe('Accounts cannot be removed here; ban or suspend the user instead');
    });
  });
});
