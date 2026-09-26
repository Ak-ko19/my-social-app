const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B12 admin moderation (migration 025).
describe('admin moderation (B12)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const makeAdmin = async (user) => {
    const { pool } = require('../helpers/testDb');
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [user.id]);
  };
  const report = (user, targetType, targetId, reason = 'spam') =>
    request(app).post('/reports').set(auth(user)).send({ targetType, targetId, reason });
  const reports = (admin, status = 'pending') =>
    request(app).get('/admin/reports').query({ status }).set(auth(admin));

  let admin;
  let author;
  let r1;
  let r2;
  let post;

  beforeEach(async () => {
    admin = await registerAndLogin(app);
    author = await registerAndLogin(app);
    r1 = await registerAndLogin(app);
    r2 = await registerAndLogin(app);
    await makeAdmin(admin);
    post = (await request(app).post('/posts').set(auth(author)).field('content', 'buy cheap stuff')).body;
  });

  it('is invisible to non-admins (404) and anonymous users (401)', async () => {
    expect((await reports(r1)).status).toBe(404);
    expect((await request(app).post(`/admin/users/${author.id}/ban`).set(auth(r1))).status).toBe(404);
    expect((await request(app).get('/admin/reports')).status).toBe(401);
  });

  it('GET /profile/me exposes is_admin', async () => {
    expect((await request(app).get('/profile/me').set(auth(admin))).body.is_admin).toBe(true);
    expect((await request(app).get('/profile/me').set(auth(r1))).body.is_admin).toBe(false);
  });

  it('lists pending reports with target summaries and per-target counts', async () => {
    await report(r1, 'post', post.id);
    await report(r2, 'post', post.id);
    await report(r1, 'user', author.id, 'harassment');
    const res = await reports(admin);
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(3);
    const postReport = res.body.reports.find((r) => r.target_type === 'post');
    expect(postReport).toMatchObject({
      post_content: 'buy cheap stuff',
      post_author_username: author.username,
      pending_for_target: 2,
      target_exists: true,
      reporter_username: r1.username
    });
    const userReport = res.body.reports.find((r) => r.target_type === 'user');
    expect(userReport).toMatchObject({ target_username: author.username, target_banned: false, reason: 'harassment' });
  });

  it('dismiss resolves every pending report on that target, recording who and how', async () => {
    await report(r1, 'post', post.id);
    await report(r2, 'post', post.id);
    const id = (await reports(admin)).body.reports[0].id;
    expect((await request(app).post(`/admin/reports/${id}/dismiss`).set(auth(admin))).status).toBe(200);
    expect((await reports(admin)).body.reports).toHaveLength(0);
    const reviewed = (await reports(admin, 'reviewed')).body.reports;
    expect(reviewed).toHaveLength(2);
    expect(reviewed[0]).toMatchObject({ resolution: 'dismissed', resolved_by_username: admin.username });
    // The post is untouched.
    expect((await request(app).get(`/posts/${post.id}`)).status).toBe(200);
  });

  it('remove-content deletes the reported post and resolves its reports', async () => {
    await report(r1, 'post', post.id);
    const id = (await reports(admin)).body.reports[0].id;
    expect((await request(app).post(`/admin/reports/${id}/remove-content`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get(`/posts/${post.id}`)).status).toBe(404);
    expect((await reports(admin, 'reviewed')).body.reports[0]).toMatchObject({ resolution: 'content_removed', target_exists: false });
  });

  it('remove-content on a user report is refused (400)', async () => {
    await report(r1, 'user', author.id);
    const id = (await reports(admin)).body.reports[0].id;
    expect((await request(app).post(`/admin/reports/${id}/remove-content`).set(auth(admin))).status).toBe(400);
  });

  it('ban: hides their content, blocks login and existing tokens, resolves reports about them and their posts', async () => {
    await report(r1, 'post', post.id);
    await report(r2, 'user', author.id);
    const res = await request(app).post(`/admin/users/${author.id}/ban`).set(auth(admin)).send({ reason: 'spam bot' });
    expect(res.status).toBe(200);

    expect((await request(app).get(`/posts/${post.id}`)).status).toBe(404);
    expect((await request(app).get(`/profile/${author.id}`).set(auth(r1))).status).toBe(404);
    const login = await request(app).post('/login').send({ email: author.email, password: author.password });
    expect(login.status).toBe(403);
    expect(login.text).toMatch(/banned/);
    // Their still-valid token is dead too...
    const oldToken = await request(app).get('/profile/me').set(auth(author));
    expect(oldToken.status).toBe(401);
    // ...and on optionalAuth routes they're treated as anonymous.
    const asAnon = await request(app).get('/posts').set(auth(author));
    expect(asAnon.status).toBe(200);

    expect((await reports(admin)).body.reports).toHaveLength(0);
    const reviewed = (await reports(admin, 'reviewed')).body.reports;
    expect(reviewed.map((r) => r.resolution)).toEqual(['user_banned', 'user_banned']);
  });

  it('a ban without a reason works (no request body at all)', async () => {
    const res = await request(app).post(`/admin/users/${author.id}/ban`).set(auth(admin));
    expect(res.status).toBe(200);
    expect((await request(app).post('/login').send({ email: author.email, password: author.password })).status).toBe(403);
  });

  it('a request with no body gets the handler 400, not a 500 (Express 5 req.body)', async () => {
    const res = await request(app).post(`/posts/${post.id}/comments`).set(auth(r1));
    expect(res.status).toBe(400);
  });

  it('cannot ban yourself or another admin; unknown user 404', async () => {
    const other = await registerAndLogin(app);
    await makeAdmin(other);
    expect((await request(app).post(`/admin/users/${admin.id}/ban`).set(auth(admin))).status).toBe(400);
    expect((await request(app).post(`/admin/users/${other.id}/ban`).set(auth(admin))).status).toBe(400);
    expect((await request(app).post('/admin/users/999999/ban').set(auth(admin))).status).toBe(404);
  });

  it('unban restores login and content; unbanning a non-banned user is 404', async () => {
    await request(app).post(`/admin/users/${author.id}/ban`).set(auth(admin));
    expect((await request(app).post(`/admin/users/${author.id}/unban`).set(auth(admin))).status).toBe(200);
    expect((await request(app).post('/login').send({ email: author.email, password: author.password })).status).toBe(200);
    expect((await request(app).get(`/posts/${post.id}`)).status).toBe(200);
    expect((await request(app).post(`/admin/users/${author.id}/unban`).set(auth(admin))).status).toBe(404);
  });

  it('revoking admin takes effect immediately (checked in the DB each request)', async () => {
    const { pool } = require('../helpers/testDb');
    expect((await reports(admin)).status).toBe(200);
    await pool.query('UPDATE users SET is_admin = false WHERE id = $1', [admin.id]);
    expect((await reports(admin)).status).toBe(404);
  });
});
