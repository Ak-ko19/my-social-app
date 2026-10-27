const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Days 103-104: the admin content search (GET /admin/search), logged.
describe('admin content search (Days 103-104)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const search = (user, query) => request(app).get('/admin/search').query(query).set(auth(user));
  const post = async (user, content, extra = {}) => {
    const req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(extra)) req.field(k, String(v));
    return (await req).body;
  };
  const logRows = async () => (await pool.query("SELECT target_id, target_label, details FROM admin_actions WHERE action = 'admin_search' ORDER BY id")).rows;

  let admin;
  let alice;
  beforeEach(async () => {
    admin = await registerAndLogin(app);
    alice = await registerAndLogin(app);
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
  });

  it('finds posts whoever may see them -- private account, "only me", a private group -- newest first, with their place', async () => {
    await request(app).put('/profile/privacy').set(auth(alice)).send({ isPrivate: true });
    const followersOnly = await post(alice, 'Buy cheap PILLS here', { visibility: 'followers' });
    const onlyMe = await post(alice, 'more cheap pills', { visibility: 'only_me' });
    const group = (await request(app).post('/communities').set(auth(alice)).send({ name: 'Secret club', privacy: 'private' })).body;
    const inGroup = await post(alice, 'cheap pills for members', { communityId: group.id });
    await post(alice, 'nothing to see');
    const res = await search(admin, { q: 'cheap pills', type: 'posts' });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.id)).toEqual([inGroup.id, onlyMe.id, followersOnly.id]);
    expect(res.body.results[0]).toMatchObject({ community_name: 'Secret club', community_privacy: 'private', author_id: alice.id, author_username: alice.username, author_banned: false });
    expect(res.body.results[1]).toMatchObject({ visibility: 'only_me', community_id: null, page_id: null });
  });

  it('long posts are cut to 300 characters; % and _ are searched as themselves; pages of 20', async () => {
    await post(alice, `100% sure ${'x'.repeat(400)}`);
    await post(alice, '100 sure');
    const cut = (await search(admin, { q: '100%', type: 'posts' })).body.results;
    expect(cut).toHaveLength(1);
    expect(cut[0].content).toHaveLength(300);
    for (let i = 0; i < 23; i++) await pool.query("INSERT INTO posts (user_id, content) VALUES ($1, 'lottery winner ' || $2)", [alice.id, i]);
    const first = (await search(admin, { q: 'lottery', type: 'posts' })).body;
    expect([first.results.length, first.hasMore, first.page]).toEqual([20, true, 1]);
    const second = (await search(admin, { q: 'lottery', type: 'posts', page: 2 })).body;
    expect([second.results.length, second.hasMore]).toEqual([3, false]);
    expect(new Set([...first.results, ...second.results].map((r) => r.id)).size).toBe(23);
  });

  it('finds comments with their post', async () => {
    const p = await post(admin, 'a post');
    const comment = (await request(app).post(`/posts/${p.id}/comments`).set(auth(alice)).send({ content: 'visit my scam site' })).body;
    const res = await search(admin, { q: 'scam site', type: 'comments' });
    expect(res.body.results).toEqual([expect.objectContaining({ id: comment.id, post_id: p.id, content: 'visit my scam site', author_username: alice.username })]);
  });

  it('finds accounts by part of the username or the whole email -- banned and deactivated ones too', async () => {
    const res = await search(admin, { q: alice.username.slice(0, 6), type: 'users' });
    expect(res.body.results.map((u) => u.id)).toContain(alice.id);
    const email = (await pool.query('SELECT email FROM users WHERE id = $1', [alice.id])).rows[0].email;
    await pool.query("UPDATE users SET banned_at = now(), is_deactivated = true WHERE id = $1", [alice.id]);
    const byEmail = await search(admin, { q: email.toUpperCase(), type: 'users' });
    expect(byEmail.body.results).toEqual([expect.objectContaining({ id: alice.id, email, banned: true, is_deactivated: true })]);
    // Part of an email finds nothing (only usernames are searched by part).
    expect((await search(admin, { q: email.split('@')[1], type: 'users' })).body.results).toEqual([]);
  });

  it('every search is logged once, with the query; later pages are not', async () => {
    for (let i = 0; i < 21; i++) await pool.query("INSERT INTO posts (user_id, content) VALUES ($1, 'free crypto ' || $2)", [alice.id, i]);
    await search(admin, { q: 'free crypto', type: 'posts' });
    await search(admin, { q: 'free crypto', type: 'posts', page: 2 });
    await search(admin, { q: alice.username, type: 'users' });
    expect(await logRows()).toEqual([
      { target_id: 'posts', target_label: 'free crypto', details: { type: 'posts', results: 20, hasMore: true } },
      { target_id: 'users', target_label: alice.username, details: { type: 'users', results: 1, hasMore: false } }
    ]);
    const log = (await request(app).get('/admin/log').query({ action: 'admin_search' }).set(auth(admin))).body.actions;
    expect(log.map((a) => a.target_label)).toEqual([alice.username, 'free crypto']);
  });

  it('validates; admins only; nothing logged for a refused search', async () => {
    expect((await search(alice, { q: 'pills' })).status).toBe(404);
    expect((await request(app).get('/admin/search').query({ q: 'pills' })).status).toBe(401);
    for (const query of [{ q: 'p' }, { q: 'x'.repeat(101) }, { q: '  a ' }, { q: 'pills', type: 'messages' }, { q: 'pills', page: 0 }, { q: 'pills', page: 51 }, { q: 'pills', page: 'x' }, {}]) {
      expect((await search(admin, query)).status).toBe(400);
    }
    expect((await search(admin, { q: 'pills' })).body.type).toBe('posts');
    expect((await logRows()).length).toBe(1);
  });
});
