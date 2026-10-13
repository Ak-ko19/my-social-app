const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 63: the admin audit log -- every moderation decision, recorded with
// it (one transaction), naming the account / group / error, never the
// removed content. GET /admin/log, newest first.
describe('admin audit log (Day 63)', () => {
  const { app, reset } = setupTestApp();
  const adminLog = () => require('../../services/adminLogService');
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const report = (user, targetType, targetId, reason = 'spam') =>
    request(app).post('/reports').set(auth(user)).send({ targetType, targetId, reason });
  const reportId = async (targetType, targetId) =>
    (await pool.query('SELECT id FROM reports WHERE target_type = $1 AND target_id = $2 ORDER BY id LIMIT 1', [targetType, targetId])).rows[0].id;
  const log = async (query = {}) => (await request(app).get('/admin/log').query(query).set(auth(admin))).body;
  const rows = async () => (await pool.query('SELECT * FROM admin_actions ORDER BY id')).rows;

  let admin;
  let author;
  let r1;
  let r2;
  let post;
  beforeEach(async () => {
    await reset();
    admin = await registerAndLogin(app);
    author = await registerAndLogin(app);
    r1 = await registerAndLogin(app);
    r2 = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    post = (await request(app).post('/posts').set(auth(author)).field('content', 'SECRET-TEXT buy cheap stuff')).body;
  });

  it('admins only; action must be a known one', async () => {
    expect((await request(app).get('/admin/log').set(auth(r1))).status).toBe(404);
    expect((await request(app).get('/admin/log')).status).toBe(401);
    const bad = await request(app).get('/admin/log').query({ action: 'deleted_everything' }).set(auth(admin));
    expect(bad.status).toBe(400);
  });

  it('dismissing a report: who, what, whose post, how many reports it closed', async () => {
    await report(r1, 'post', post.id);
    await report(r2, 'post', post.id);
    const id = await reportId('post', post.id);
    expect((await request(app).post(`/admin/reports/${id}/dismiss`).set(auth(admin))).status).toBe(200);
    const { actions } = await log();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      admin_id: admin.id,
      admin_username: admin.username,
      action: 'report_dismissed',
      target_type: 'post',
      target_id: String(post.id),
      target_label: author.username,
      details: { reportId: id, reportsResolved: 2 }
    });
  });

  it('removing content: whose it was -- but never the content itself', async () => {
    const comment = (await request(app).post(`/posts/${post.id}/comments`).set(auth(author)).send({ content: 'SECRET-TEXT in a comment' })).body;
    await report(r1, 'comment', comment.id);
    await report(r1, 'post', post.id);
    await request(app).post(`/admin/reports/${await reportId('comment', comment.id)}/remove-content`).set(auth(admin));
    await request(app).post(`/admin/reports/${await reportId('post', post.id)}/remove-content`).set(auth(admin));
    const { actions } = await log();
    expect(actions.map((a) => [a.action, a.target_type, a.target_label])).toEqual([
      ['content_removed', 'post', author.username],
      ['content_removed', 'comment', author.username]
    ]);
    expect(JSON.stringify(await rows())).not.toContain('SECRET-TEXT');
  });

  it('bans, suspensions (with days and the reason) and unbans', async () => {
    await report(r1, 'user', author.id, 'harassment');
    await request(app).post(`/admin/users/${author.id}/suspend`).set(auth(admin)).send({ days: 7, reason: 'cool off' });
    await request(app).post(`/admin/users/${author.id}/ban`).set(auth(admin)).send({ reason: 'again' });
    await request(app).post(`/admin/users/${author.id}/unban`).set(auth(admin));
    const { actions } = await log();
    expect(actions.map((a) => [a.action, a.target_label, a.details])).toEqual([
      ['user_unbanned', author.username, {}],
      ['user_banned', author.username, { reason: 'again', reportsResolved: 0 }],
      ['user_suspended', author.username, { days: 7, reason: 'cool off', reportsResolved: 1 }]
    ]);
    // Refused actions aren't logged.
    expect((await request(app).post(`/admin/users/${author.id}/unban`).set(auth(admin))).status).toBe(404);
    expect((await request(app).post(`/admin/users/${admin.id}/ban`).set(auth(admin))).status).toBe(400);
    expect(await rows()).toHaveLength(3);
  });

  it('resolving an error: its message as the label', async () => {
    await pool.query(`INSERT INTO error_groups (fingerprint, source, message) VALUES (repeat('f', 40), 'api', 'Something exploded')`);
    expect((await request(app).post(`/admin/errors/${'f'.repeat(40)}/resolve`).set(auth(admin))).status).toBe(200);
    expect((await log()).actions[0]).toMatchObject({ action: 'error_resolved', target_type: 'error', target_id: 'f'.repeat(40), target_label: 'Something exploded' });
  });

  it('the decision and its log entry are one: if the log can\'t be written, nothing happens', async () => {
    await report(r1, 'post', post.id);
    const spy = jest.spyOn(adminLog(), 'record').mockRejectedValueOnce(new Error('disk full'));
    try {
      const res = await request(app).post(`/admin/reports/${await reportId('post', post.id)}/remove-content`).set(auth(admin));
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await pool.query('SELECT id FROM posts WHERE id = $1', [post.id])).rows).toHaveLength(1);
    expect((await pool.query("SELECT status FROM reports WHERE target_type = 'post'")).rows).toEqual([{ status: 'pending' }]);
    expect(await rows()).toHaveLength(0);
  });

  it('newest first, 30 a page, one kind at a time; it outlives the admin\'s account', async () => {
    const values = Array.from({ length: 32 }, (_, i) => `($1, $2, 'user_unbanned', 'user', '${i}', now() - interval '${i} minutes')`).join(', ');
    await pool.query(`INSERT INTO admin_actions (admin_id, admin_username, action, target_type, target_id, created_at) VALUES ${values}`, [admin.id, admin.username]);
    await pool.query(`INSERT INTO admin_actions (admin_id, admin_username, action, target_type, target_id) VALUES ($1, $2, 'error_resolved', 'error', 'e')`, [admin.id, admin.username]);
    const first = await log();
    expect(first.actions).toHaveLength(30);
    expect(first.hasMore).toBe(true);
    expect(first.actions[0].action).toBe('error_resolved');
    expect((await log({ page: 2 })).actions.map((a) => a.target_id)).toEqual(['29', '30', '31']);
    expect((await log({ action: 'error_resolved' })).actions).toHaveLength(1);
    await pool.query('DELETE FROM users WHERE id = $1', [admin.id]);
    expect((await pool.query('SELECT DISTINCT admin_id, admin_username FROM admin_actions')).rows).toEqual([{ admin_id: null, admin_username: admin.username }]);
  });

  it('the daily cleanup keeps it for 2 years', async () => {
    await pool.query(`INSERT INTO admin_actions (admin_id, admin_username, action, target_type, target_id, created_at) VALUES
      ($1, $2, 'user_unbanned', 'user', 'old', now() - interval '2 years 1 day'), ($1, $2, 'user_unbanned', 'user', 'recent', now() - interval '700 days')`, [admin.id, admin.username]);
    const result = await require('../../services/cleanupService').run();
    expect(result.adminLog).toBe(1);
    expect((await rows()).map((r) => r.target_id)).toEqual(['recent']);
  });
});
