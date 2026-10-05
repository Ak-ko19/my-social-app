const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 12 step 1: comments and messages can be reported (migration 031).
describe('reporting comments and messages (Day 12)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const report = (user, targetType, targetId, reason = 'harassment', details) =>
    request(app).post('/reports').set(auth(user)).send({ targetType, targetId, reason, details });
  const pending = (admin) => request(app).get('/admin/reports').set(auth(admin));

  let admin;
  let alice;
  let bob;
  let carol;
  let post;
  let comment;
  let dm;
  let message;

  beforeEach(async () => {
    const { pool } = require('../helpers/testDb');
    admin = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    alice = await registerAndLogin(app);
    bob = await registerAndLogin(app);
    carol = await registerAndLogin(app);
    post = (await request(app).post('/posts').set(auth(alice)).field('content', 'hello world')).body;
    comment = (await request(app).post(`/posts/${post.id}/comments`).set(auth(bob)).send({ content: 'you are an idiot' })).body;
    dm = (await request(app).post('/conversations').set(auth(alice)).send({ userId: bob.id })).body;
    message = (await request(app).post(`/conversations/${dm.id}/messages`).set(auth(bob)).send({ content: 'send me money or else' })).body;
  });

  describe('comments', () => {
    it('anyone can report someone else\'s comment; the text is kept as reported', async () => {
      const res = await report(alice, 'comment', comment.id, 'harassment', 'rude');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ target_type: 'comment', target_id: comment.id, target_owner_id: bob.id, target_snapshot: 'you are an idiot' });
    });

    it('not your own comment, nor one that does not exist', async () => {
      const own = await report(bob, 'comment', comment.id);
      expect(own.status).toBe(400);
      expect(own.text).toBe('You cannot report your own comment');
      const missing = await report(alice, 'comment', 999999);
      expect(missing.status).toBe(404);
      expect(missing.text).toBe('Comment not found');
    });

    it('keeps only the first 1000 characters of a long comment', async () => {
      const long = (await request(app).post(`/posts/${post.id}/comments`).set(auth(bob)).send({ content: 'x'.repeat(1500) })).body;
      expect(long.id).toBeDefined();
      const res = await report(alice, 'comment', long.id);
      expect(res.body.target_snapshot).toHaveLength(1000);
    });
  });

  describe('messages', () => {
    it('someone in the conversation can report a message sent to them', async () => {
      const res = await report(alice, 'message', message.id, 'spam');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ target_type: 'message', target_owner_id: bob.id, target_snapshot: 'send me money or else' });
    });

    it('outsiders get a plain 404, exactly as for a message that does not exist', async () => {
      const outsider = await report(carol, 'message', message.id);
      const missing = await report(carol, 'message', 999999);
      expect(outsider.status).toBe(404);
      expect(outsider.text).toBe('Message not found');
      expect(missing.status).toBe(404);
      expect(missing.text).toBe(outsider.text);
    });

    it('not your own message, nor an unsent one', async () => {
      const own = await report(bob, 'message', message.id);
      expect(own.status).toBe(400);
      expect(own.text).toBe('You cannot report your own message');
      expect((await request(app).delete(`/conversations/${dm.id}/messages/${message.id}`).set(auth(bob))).status).toBe(200);
      expect((await report(alice, 'message', message.id)).status).toBe(404);
    });

    it('works in a group for any member', async () => {
      const group = (await request(app).post('/conversations/groups').set(auth(alice)).send({ name: 'Trip', userIds: [bob.id, carol.id] })).body;
      if (!group.id) throw new Error(`group create failed: ${JSON.stringify(group)}`);
      const m = (await request(app).post(`/conversations/${group.id}/messages`).set(auth(bob)).send({ content: 'group spam' })).body;
      expect((await report(carol, 'message', m.id, 'spam')).status).toBe(201);
    });
  });

  it('still validates target types', async () => {
    const res = await report(alice, 'story', 1);
    expect(res.status).toBe(400);
    expect(res.text).toBe('targetType must be "post", "user", "comment", "message", "community" or "page"');
  });

  it('post reports now keep the author and the text as reported too', async () => {
    const res = await report(bob, 'post', post.id, 'spam');
    expect(res.body).toMatchObject({ target_owner_id: alice.id, target_snapshot: 'hello world' });
  });

  describe('admin view', () => {
    it('shows the reported comment and message (and who wrote them), never the rest of the chat', async () => {
      await request(app).post(`/conversations/${dm.id}/messages`).set(auth(alice)).send({ content: 'a private reply' });
      await report(alice, 'comment', comment.id);
      await report(alice, 'message', message.id, 'spam');
      const res = await pending(admin);
      expect(res.status).toBe(200);
      const c = res.body.reports.find((r) => r.target_type === 'comment');
      expect(c).toMatchObject({
        comment_content: 'you are an idiot', comment_post_id: post.id, target_owner_username: bob.username,
        target_owner_banned: false, target_exists: true, target_snapshot: 'you are an idiot'
      });
      const m = res.body.reports.find((r) => r.target_type === 'message');
      expect(m).toMatchObject({ message_content: 'send me money or else', message_type: 'text', target_owner_username: bob.username, target_exists: true });
      expect(JSON.stringify(res.body)).not.toContain('a private reply');
    });

    it('after an edit or unsend, the admin still sees what was reported', async () => {
      await report(alice, 'message', message.id);
      await report(alice, 'comment', comment.id);
      await request(app).delete(`/conversations/${dm.id}/messages/${message.id}`).set(auth(bob));
      await request(app).delete(`/comments/${comment.id}`).set(auth(bob));
      const res = await pending(admin);
      const m = res.body.reports.find((r) => r.target_type === 'message');
      expect(m).toMatchObject({ target_exists: false, message_content: null, target_snapshot: 'send me money or else' });
      const c = res.body.reports.find((r) => r.target_type === 'comment');
      expect(c.target_snapshot).toBe('you are an idiot');
    });

    it('banning the author resolves reports on their comments and messages', async () => {
      await report(alice, 'comment', comment.id);
      await report(alice, 'message', message.id);
      await report(carol, 'post', post.id); // someone else's post: stays pending
      expect((await request(app).post(`/admin/users/${bob.id}/ban`).set(auth(admin))).status).toBe(200);
      const left = (await pending(admin)).body.reports;
      expect(left.map((r) => r.target_type)).toEqual(['post']);
      const reviewed = (await request(app).get('/admin/reports').query({ status: 'reviewed' }).set(auth(admin))).body.reports;
      expect(reviewed.map((r) => r.resolution)).toEqual(['user_banned', 'user_banned']);
    });

    it('dismissing a comment report resolves all pending reports on that comment', async () => {
      await report(alice, 'comment', comment.id);
      await report(carol, 'comment', comment.id, 'hate_speech');
      const [first] = (await pending(admin)).body.reports;
      expect(first.pending_for_target).toBe(2);
      expect((await request(app).post(`/admin/reports/${first.id}/dismiss`).set(auth(admin))).status).toBe(200);
      expect((await pending(admin)).body.reports).toHaveLength(0);
    });
  });
});
