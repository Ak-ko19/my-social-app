const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 82: when an admin removes something after a report, its owner is told
// what and why -- like Facebook's "We removed your post".
describe('"we removed your post" notices (Day 82)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const report = (user, targetType, targetId, reason = 'spam') =>
    request(app).post('/reports').set(auth(user)).send({ targetType, targetId, reason });
  const reportId = async (targetType, targetId) =>
    (await pool.query('SELECT id FROM reports WHERE target_type = $1 AND target_id = $2 ORDER BY id LIMIT 1', [targetType, targetId])).rows[0].id;
  const notices = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications.filter((n) => n.type === 'content_removed');
  const settle = () => new Promise((r) => setTimeout(r, 50)); // the notice isn't awaited by the request

  let admin;
  let author;
  let reporter;
  beforeEach(async () => {
    admin = await registerAndLogin(app);
    author = await registerAndLogin(app);
    reporter = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
  });

  it('a removed post: the owner hears what and why, with its first words; nobody else does', async () => {
    const long = `Buy cheap stuff now ${'x'.repeat(200)}`;
    const post = (await request(app).post('/posts').set(auth(author)).field('content', long)).body;
    await report(reporter, 'post', post.id, 'spam');
    const res = await request(app).post(`/admin/reports/${await reportId('post', post.id)}/remove-content`).set(auth(admin));
    expect(res.status).toBe(200);
    await settle();
    const [notice] = await notices(author);
    expect(notice).toMatchObject({ type: 'content_removed', post_id: null, actor_id: author.id, details: { kind: 'post', reason: 'spam' } });
    expect([...notice.details.excerpt]).toHaveLength(100);
    expect(long.startsWith(notice.details.excerpt)).toBe(true);
    expect(await notices(reporter)).toEqual([]);
    expect(await notices(admin)).toEqual([]);
  });

  it('a comment and a message too, with the reason they were reported for', async () => {
    const post = (await request(app).post('/posts').set(auth(reporter)).field('content', 'hello')).body;
    const comment = (await request(app).post(`/posts/${post.id}/comments`).set(auth(author)).send({ content: 'you are awful' })).body;
    await report(reporter, 'comment', comment.id, 'harassment');
    await request(app).post(`/admin/reports/${await reportId('comment', comment.id)}/remove-content`).set(auth(admin));

    const conv = (await request(app).post('/conversations').set(auth(author)).send({ userId: reporter.id })).body;
    const message = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(author)).send({ content: 'nasty words' })).body;
    await report(reporter, 'message', message.id, 'hate_speech');
    await request(app).post(`/admin/reports/${await reportId('message', message.id)}/remove-content`).set(auth(admin));
    await settle();
    expect((await notices(author)).map((n) => n.details)).toEqual([
      { kind: 'message', reason: 'hate_speech', excerpt: 'nasty words' },
      { kind: 'comment', reason: 'harassment', excerpt: 'you are awful' }
    ]);
  });

  it('a dismissed report tells nobody', async () => {
    const post = (await request(app).post('/posts').set(auth(author)).field('content', 'fine post')).body;
    await report(reporter, 'post', post.id);
    await request(app).post(`/admin/reports/${await reportId('post', post.id)}/dismiss`).set(auth(admin));
    await settle();
    expect(await notices(author)).toEqual([]);
  });

  it('has no off switch, and is in the data export', async () => {
    await request(app).put('/notification-preferences').set(auth(author)).send({ likes: false, comments: false, mentions: false, follows: false });
    const post = (await request(app).post('/posts').set(auth(author)).field('content', 'spam spam')).body;
    await report(reporter, 'post', post.id, 'other');
    await request(app).post(`/admin/reports/${await reportId('post', post.id)}/remove-content`).set(auth(admin));
    await settle();
    expect(await notices(author)).toHaveLength(1);
    const exported = JSON.parse((await request(app).get('/profile/export').set(auth(author))).text);
    expect(exported.notifications.find((n) => n.type === 'content_removed').details).toEqual({ kind: 'post', reason: 'other', excerpt: 'spam spam' });
  });
});
