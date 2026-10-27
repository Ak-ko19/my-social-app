const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 103: acting on several reports at once (POST /admin/reports/bulk).
describe('bulk actions on reports (Day 103)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const report = async (user, targetType, targetId, reason = 'spam') =>
    (await request(app).post('/reports').set(auth(user)).send({ targetType, targetId, reason })).body;
  const bulk = (user, action, reportIds) => request(app).post('/admin/reports/bulk').set(auth(user)).send({ action, reportIds });
  const pending = async () => (await pool.query("SELECT id FROM reports WHERE status = 'pending' ORDER BY id")).rows.map((r) => r.id);
  const log = async () => (await pool.query('SELECT action, target_type, target_id, details FROM admin_actions ORDER BY id')).rows;

  let admin;
  let author;
  let reporter;
  let other;
  beforeEach(async () => {
    admin = await registerAndLogin(app);
    author = await registerAndLogin(app);
    reporter = await registerAndLogin(app);
    other = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
  });
  const postBy = async (user, content) => (await request(app).post('/posts').set(auth(user)).field('content', content)).body;

  it('dismisses several reports, each logged (marked bulk); the content stays', async () => {
    const p1 = await postBy(author, 'one');
    const p2 = await postBy(author, 'two');
    const a = await report(reporter, 'post', p1.id);
    const b = await report(reporter, 'post', p2.id);
    const res = await bulk(admin, 'dismiss', [a.id, b.id]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ done: [a.id, b.id], skipped: [], failed: [] });
    expect(await pending()).toEqual([]);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM posts')).rows[0].n).toBe(2);
    expect(await log()).toEqual([
      expect.objectContaining({ action: 'report_dismissed', target_type: 'post', target_id: String(p1.id), details: expect.objectContaining({ reportId: a.id, bulk: true }) }),
      expect.objectContaining({ action: 'report_dismissed', target_type: 'post', target_id: String(p2.id), details: expect.objectContaining({ reportId: b.id, bulk: true }) })
    ]);
  });

  it('removes several kinds of content; the owners are told; the single action is unchanged', async () => {
    const post = await postBy(author, 'buy cheap stuff');
    const comment = (await request(app).post(`/posts/${post.id}/comments`).set(auth(other)).send({ content: 'spam comment' })).body;
    const page = (await request(app).post('/pages').set(auth(other)).send({ name: 'Scam Shop' })).body;
    const rPost = await report(reporter, 'post', post.id);
    const rComment = await report(reporter, 'comment', comment.id);
    const rPage = await report(reporter, 'page', page.id);
    const res = await bulk(admin, 'remove', [rComment.id, rPage.id, rPost.id]);
    expect(res.body).toEqual({ done: [rComment.id, rPage.id, rPost.id], skipped: [], failed: [] });
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM posts WHERE id = $1', [post.id])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM pages WHERE id = $1', [page.id])).rows[0].n).toBe(0);
    const notices = (await pool.query("SELECT user_id, details FROM notifications WHERE type = 'content_removed' ORDER BY id")).rows;
    expect(notices.map((n) => [n.user_id, n.details.kind])).toEqual([[other.id, 'comment'], [other.id, 'page'], [author.id, 'post']]);
    expect((await log()).every((e) => e.action === 'content_removed' && e.details.bulk === true)).toBe(true);
    // The one-at-a-time action logs without the bulk mark.
    const later = await report(reporter, 'post', (await postBy(author, 'again')).id);
    await request(app).post(`/admin/reports/${later.id}/dismiss`).set(auth(admin));
    expect((await log()).at(-1).details.bulk).toBeUndefined();
  });

  it('skips reports already handled -- also ones closed earlier in the same batch -- and fails one alone', async () => {
    const post = await postBy(author, 'spam');
    const first = await report(reporter, 'post', post.id);
    const second = await report(other, 'post', post.id); // same target
    const account = await report(reporter, 'user', author.id);
    const res = await bulk(admin, 'remove', [first.id, second.id, account.id, 999999]);
    expect(res.body).toEqual({
      done: [first.id],
      skipped: [second.id],
      failed: [
        { id: account.id, error: 'Accounts cannot be removed here; ban or suspend the user instead' },
        { id: 999999, error: 'Report not found' }
      ]
    });
    // The account report is still waiting; one log entry for the post.
    expect(await pending()).toEqual([account.id]);
    expect((await log()).map((e) => e.action)).toEqual(['content_removed']);
    // Again: nothing to do.
    expect((await bulk(admin, 'dismiss', [first.id])).body).toEqual({ done: [], skipped: [first.id], failed: [] });
  });

  it('validates the request; admins only', async () => {
    const r = await report(reporter, 'user', author.id);
    expect((await bulk(reporter, 'dismiss', [r.id])).status).toBe(404);
    expect((await request(app).post('/admin/reports/bulk').send({ action: 'dismiss', reportIds: [r.id] })).status).toBe(401);
    for (const [action, ids] of [['delete', [r.id]], ['dismiss', []], ['dismiss', 'x'], ['dismiss', [r.id, '2']], ['dismiss', [0]], ['dismiss', [1.5]],
      ['dismiss', Array.from({ length: 51 }, (_, i) => i + 1)], [undefined, [r.id]]]) {
      expect((await bulk(admin, action, ids)).status).toBe(400);
    }
    // Repeated ids count once.
    expect((await bulk(admin, 'dismiss', [r.id, r.id])).body).toEqual({ done: [r.id], skipped: [], failed: [] });
    expect((await log()).length).toBe(1);
  });
});
