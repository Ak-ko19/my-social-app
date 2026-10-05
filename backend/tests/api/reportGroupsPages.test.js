const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 24: groups (communities) and pages can be reported (migration 038),
// and a moderator can remove them.
describe('reporting groups and pages (Day 24)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const { pool } = require('../helpers/testDb');
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  const report = (u, targetType, targetId, reason = 'spam') => request(app).post('/reports').set(auth(u)).send({ targetType, targetId, reason });

  let admin;
  let owner;
  let alice;
  let member;
  let group;
  let secret;
  let page;

  beforeEach(async () => {
    admin = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    owner = await registerAndLogin(app);
    alice = await registerAndLogin(app);
    member = await registerAndLogin(app);
    group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Cheap watches', description: 'buy now', privacy: 'public' })).body;
    secret = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Secret club', privacy: 'private' })).body;
    await pool.query("INSERT INTO community_members (community_id, user_id, role, status) VALUES ($1, $2, 'member', 'member')", [secret.id, member.id]);
    page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Fake Bank', description: 'send us your PIN' })).body;
    expect(group.id && secret.id && page.id).toBeTruthy();
  });

  it('anyone can report a public group or a page; the name and description are kept', async () => {
    const g = await report(alice, 'community', group.id);
    expect(g.status).toBe(201);
    expect(g.body).toMatchObject({ target_type: 'community', target_owner_id: owner.id, target_snapshot: 'Cheap watches — buy now' });
    const p = await report(alice, 'page', page.id, 'misinformation');
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ target_type: 'page', target_owner_id: owner.id, target_snapshot: 'Fake Bank — send us your PIN' });
  });

  it('a private group: members only; anyone else gets the same 404 as a missing group', async () => {
    expect((await report(member, 'community', secret.id)).status).toBe(201);
    const outsider = await report(alice, 'community', secret.id);
    const missing = await report(alice, 'community', 999999);
    expect(outsider.status).toBe(404);
    expect(outsider.text).toBe('Group not found');
    expect(missing.text).toBe(outsider.text);
  });

  it('not your own group or page, nor one that does not exist', async () => {
    expect((await report(owner, 'community', group.id)).text).toBe('You cannot report your own group');
    expect((await report(owner, 'page', page.id)).text).toBe('You cannot report your own page');
    expect((await report(alice, 'page', 999999)).status).toBe(404);
  });

  it('the moderator sees them, and removing one deletes it with its posts', async () => {
    await report(alice, 'community', group.id);
    await report(alice, 'page', page.id);
    await pool.query("INSERT INTO posts (user_id, content, community_id) VALUES ($1, 'group post', $2)", [owner.id, group.id]);
    await pool.query("INSERT INTO posts (user_id, content, page_id) VALUES ($1, 'page post', $2)", [owner.id, page.id]);
    const list = (await request(app).get('/admin/reports').set(auth(admin))).body.reports;
    const g = list.find((r) => r.target_type === 'community');
    const p = list.find((r) => r.target_type === 'page');
    expect(g).toMatchObject({ community_name: 'Cheap watches', community_privacy: 'public', target_owner_username: owner.username, target_exists: true });
    expect(p).toMatchObject({ page_name: 'Fake Bank', target_exists: true });

    for (const r of [g, p]) {
      expect((await request(app).post(`/admin/reports/${r.id}/remove-content`).set(auth(admin))).status).toBe(200);
    }
    expect((await pool.query('SELECT count(*)::int AS n FROM communities WHERE id = $1', [group.id])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM pages WHERE id = $1', [page.id])).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM posts WHERE content IN ('group post', 'page post')")).rows[0].n).toBe(0);
    const reviewed = (await request(app).get('/admin/reports').query({ status: 'reviewed' }).set(auth(admin))).body.reports;
    expect(reviewed.map((r) => [r.target_type, r.resolution, r.target_exists]).sort()).toEqual([
      ['community', 'content_removed', false], ['page', 'content_removed', false]
    ]);
    // The private group is untouched.
    expect((await pool.query('SELECT count(*)::int AS n FROM communities WHERE id = $1', [secret.id])).rows[0].n).toBe(1);
  });

  it('banning the owner resolves reports on their groups and pages', async () => {
    await report(alice, 'community', group.id);
    await report(alice, 'page', page.id);
    await request(app).post(`/admin/users/${owner.id}/ban`).set(auth(admin));
    expect((await request(app).get('/admin/reports').set(auth(admin))).body.reports).toHaveLength(0);
  });
});
