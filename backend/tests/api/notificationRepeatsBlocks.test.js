const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 91 (AUDIT_REPORT_4): undoing and redoing a like or a follow doesn't
// notify (and push) again (B2), and people with a block between you leave
// your notifications -- rows, grouped counts, faces, the badge -- until an
// unblock (B1).
describe('notifications: no repeats, no blocked people (Day 91)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const list = async (user, query = '') => (await request(app).get(`/notifications${query}`).set(auth(user))).body.notifications;
  const unread = async (user) => (await request(app).get('/notifications/unread-count').set(auth(user))).body.unreadCount;
  const newPost = async (user, content = 'a post') => (await request(app).post('/posts').set(auth(user)).field('content', content)).body;
  const rowsFor = async (user, actor, type) =>
    Number((await pool.query('SELECT count(*) FROM notifications WHERE user_id = $1 AND actor_id = $2 AND type = $3', [user.id, actor.id, type])).rows[0].count);
  const block = (user, other) => request(app).post(`/users/${other.id}/block`).set(auth(user));
  const unblock = (user, other) => request(app).delete(`/users/${other.id}/block`).set(auth(user));
  // Live events stand in for pushes: both go out only when a notification
  // row is really created (notificationService.notify).
  const listen = () => {
    const emitted = [];
    jest.spyOn(require('../../sockets'), 'getIO').mockReturnValue({ to: (room) => ({ emit: (event, payload) => emitted.push([room, event, payload]) }) });
    return emitted;
  };
  const settle = () => new Promise((r) => setTimeout(r, 50)); // announce() isn't awaited

  describe('B2: no repeats', () => {
    it('like -> unlike -> like, five times: one notification, one live event', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const post = await newPost(me);
      const emitted = listen();
      for (let i = 0; i < 5; i++) {
        expect((await request(app).post(`/posts/${post.id}/like`).set(auth(fan))).status).toBe(201);
        expect((await request(app).delete(`/posts/${post.id}/like`).set(auth(fan))).status).toBe(200);
      }
      await settle();
      expect(await rowsFor(me, fan, 'like')).toBe(1);
      expect(emitted.filter(([room, event]) => room === `user_${me.id}` && event === 'notification_new')).toHaveLength(1);
    });

    it('a reaction after an unliked like is not news either', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const post = await newPost(me);
      await request(app).post(`/posts/${post.id}/like`).set(auth(fan));
      await request(app).delete(`/posts/${post.id}/like`).set(auth(fan));
      expect((await request(app).put(`/posts/${post.id}/reaction`).set(auth(fan)).send({ reaction: 'love' })).status).toBe(201);
      expect(await rowsFor(me, fan, 'like')).toBe(1);
    });

    it('still notifies after the first one was read, never twice', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const post = await newPost(me);
      await request(app).post(`/posts/${post.id}/like`).set(auth(fan));
      await request(app).put('/notifications/read-all').set(auth(me));
      await request(app).delete(`/posts/${post.id}/like`).set(auth(fan));
      await request(app).post(`/posts/${post.id}/like`).set(auth(fan));
      expect(await rowsFor(me, fan, 'like')).toBe(1);
      expect(await unread(me)).toBe(0);
    });

    it('a like of a different post, or by someone else, is still news', async () => {
      const me = await registerAndLogin(app);
      const [a, b] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
      const one = await newPost(me, 'one');
      const two = await newPost(me, 'two');
      await request(app).post(`/posts/${one.id}/like`).set(auth(a));
      await request(app).post(`/posts/${two.id}/like`).set(auth(a));
      await request(app).post(`/posts/${one.id}/like`).set(auth(b));
      expect(await rowsFor(me, a, 'like')).toBe(2);
      expect(await rowsFor(me, b, 'like')).toBe(1);
    });

    it('comment likes: once per comment', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const post = await newPost(me);
      const first = (await request(app).post(`/posts/${post.id}/comments`).set(auth(me)).send({ content: 'first' })).body;
      const second = (await request(app).post(`/posts/${post.id}/comments`).set(auth(me)).send({ content: 'second' })).body;
      for (let i = 0; i < 3; i++) {
        await request(app).post(`/comments/${first.id}/like`).set(auth(fan));
        await request(app).delete(`/comments/${first.id}/like`).set(auth(fan));
      }
      await request(app).post(`/comments/${second.id}/like`).set(auth(fan));
      expect(await rowsFor(me, fan, 'comment_like')).toBe(2);
    });

    it('follow -> unfollow -> follow: once a day', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      for (let i = 0; i < 3; i++) {
        expect((await request(app).post(`/users/${me.id}/follow`).set(auth(fan))).status).toBe(201);
        await request(app).delete(`/users/${me.id}/follow`).set(auth(fan));
      }
      expect(await rowsFor(me, fan, 'follow')).toBe(1);
      // A day later, following again is news again.
      await pool.query("UPDATE notifications SET created_at = now() - interval '25 hours' WHERE user_id = $1", [me.id]);
      await request(app).post(`/users/${me.id}/follow`).set(auth(fan));
      expect(await rowsFor(me, fan, 'follow')).toBe(2);
    });

    it('follow requests to a private account: once a day', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      await pool.query('UPDATE users SET is_private = true WHERE id = $1', [me.id]);
      for (let i = 0; i < 3; i++) {
        expect((await request(app).post(`/users/${me.id}/follow`).set(auth(fan))).body.status).toBe('pending');
        await request(app).delete(`/users/${me.id}/follow`).set(auth(fan));
      }
      expect(await rowsFor(me, fan, 'follow_request')).toBe(1);
    });

    it('comments are never folded: each one is something new to read', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const post = await newPost(me);
      await request(app).post(`/posts/${post.id}/comments`).set(auth(fan)).send({ content: 'one' });
      await request(app).post(`/posts/${post.id}/comments`).set(auth(fan)).send({ content: 'two' });
      expect(await rowsFor(me, fan, 'comment')).toBe(2);
    });
  });

  describe('B1: blocked people leave your notifications', () => {
    it('blocking a liker: out of the group, its count, its faces and the badge; back after unblock', async () => {
      const me = await registerAndLogin(app);
      const [a, b, c] = await Promise.all([registerAndLogin(app), registerAndLogin(app), registerAndLogin(app)]);
      const post = await newPost(me);
      for (const fan of [a, b, c]) await request(app).post(`/posts/${post.id}/like`).set(auth(fan));
      expect(await unread(me)).toBe(3);

      expect((await block(me, c)).status).toBe(201);
      let [row] = await list(me);
      expect(row).toMatchObject({ type: 'like', count: 2, actor_count: 2, actor_id: b.id });
      expect(row.actors.map((x) => x.id)).toEqual([b.id, a.id]);
      expect(JSON.stringify(await list(me))).not.toContain(c.username);
      expect(await unread(me)).toBe(2);

      expect((await unblock(me, c)).status).toBe(200);
      [row] = await list(me);
      expect(row).toMatchObject({ count: 3, actor_count: 3, actor_id: c.id });
      expect(await unread(me)).toBe(3);
    });

    it('works the other way too: someone who blocked you leaves your notifications', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      await request(app).post(`/users/${me.id}/follow`).set(auth(fan));
      expect(await list(me)).toHaveLength(1);
      await block(fan, me);
      expect(await list(me)).toEqual([]);
      expect(await unread(me)).toBe(0);
    });

    it('a group with only blocked people disappears; every tab agrees', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const post = await newPost(me);
      await request(app).post(`/posts/${post.id}/comments`).set(auth(fan)).send({ content: `hi @${me.username}` });
      await request(app).post(`/posts/${post.id}/like`).set(auth(fan));
      await block(me, fan);
      for (const filter of ['all', 'unread', 'mentions', 'follows']) {
        expect(await list(me, `?filter=${filter}`)).toEqual([]);
      }
    });

    it('your own alerts stay (they have no other person)', async () => {
      const me = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      await require('../../services/notificationService').notifySystem({ userId: me.id, type: 'new_login', device: { browser: 'Firefox', os: 'Linux', kind: 'desktop' } });
      await block(me, other);
      expect((await list(me)).map((n) => n.type)).toEqual(['new_login']);
      expect(await unread(me)).toBe(1);
    });

    it('nothing new arrives across a block (no row, no push, no live event)', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      const post = await newPost(me);
      await block(me, fan);
      const emitted = listen();
      // Mentions check blocks themselves (mentionService); notify() is the
      // way in for every other kind, called here as a controller would.
      await newPost(fan, `hello @${me.username}`);
      await require('../../services/notificationService').notify({ userId: me.id, actorId: fan.id, type: 'like', postId: post.id });
      await settle();
      expect(Number((await pool.query('SELECT count(*) FROM notifications WHERE user_id = $1', [me.id])).rows[0].count)).toBe(0);
      expect(emitted.filter(([room, event]) => room === `user_${me.id}` && event === 'notification_new')).toEqual([]);
    });

    it('block and unblock update both badges at once, without the "new" cue', async () => {
      const me = await registerAndLogin(app);
      const fan = await registerAndLogin(app);
      await request(app).post(`/users/${me.id}/follow`).set(auth(fan));
      const emitted = listen();
      await block(me, fan);
      await settle();
      expect(emitted).toContainEqual([`user_${me.id}`, 'notifications_read', { unreadCount: 0 }]);
      expect(emitted).toContainEqual([`user_${fan.id}`, 'notifications_read', { unreadCount: 0 }]);
      await unblock(me, fan);
      await settle();
      expect(emitted).toContainEqual([`user_${me.id}`, 'notifications_read', { unreadCount: 1 }]);
      expect(emitted.some(([, event]) => event === 'notification_new')).toBe(false);
    });
  });
});
