const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 53 step 1: page admins (migration 063). The owner adds people who
// edit the page, post as it and manage its posts; page posts stay the
// owner's (posts.user_id).
describe('page admins (Day 53)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const createPage = (user, name = 'Corner Cafe') => request(app).post('/pages').set(auth(user)).send({ name, category: 'business' });
  const addAdmin = (user, pageId, username) => request(app).post(`/pages/${pageId}/admins`).set(auth(user)).send({ username });
  const removeAdmin = (user, pageId, target) => request(app).delete(`/pages/${pageId}/admins/${target.id}`).set(auth(user));
  const admins = (user, pageId) => request(app).get(`/pages/${pageId}/admins`).set(auth(user));
  const postAsPage = (user, pageId, content) => request(app).post('/posts').set(auth(user)).field('content', content).field('pageId', String(pageId));

  let owner;
  let helper;
  let stranger;
  let page;
  beforeEach(async () => {
    owner = await registerAndLogin(app);
    helper = await registerAndLogin(app);
    stranger = await registerAndLogin(app);
    page = (await createPage(owner)).body;
  });

  it('the owner adds an admin by username (any case, with or without @); they see who runs it', async () => {
    const res = await addAdmin(owner, page.id, `@${helper.username.toUpperCase()}`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: helper.id, username: helper.username });
    expect((await addAdmin(owner, page.id, helper.username)).status).toBe(201); // twice is harmless
    const list = (await admins(helper, page.id)).body;
    expect(list.owner).toMatchObject({ id: owner.id, username: owner.username });
    expect(list.admins.map((a) => a.id)).toEqual([helper.id]);
    expect((await request(app).get(`/pages/${page.id}`).set(auth(helper))).body).toMatchObject({ is_owner: false, is_admin: true });
    expect((await request(app).get(`/pages/${page.id}`).set(auth(stranger))).body).toMatchObject({ is_owner: false, is_admin: false });
    expect((await admins(stranger, page.id)).status).toBe(403);
  });

  it('an admin edits the page and posts as it; the post is the owner\'s and theirs to manage', async () => {
    await addAdmin(owner, page.id, helper.username);
    expect((await request(app).patch(`/pages/${page.id}`).set(auth(helper)).send({ description: 'Open 7-3' })).body.description).toBe('Open 7-3');
    const post = (await postAsPage(helper, page.id, 'Fresh bread today')).body;
    expect(post.user_id).toBe(owner.id);
    expect(post.page_id).toBe(page.id);
    const pagePosts = (await request(app).get(`/pages/${page.id}/posts`).set(auth(stranger))).body.posts;
    expect(pagePosts.map((p) => p.content)).toEqual(['Fresh bread today']);
    // Admins edit and delete the page's posts -- the owner's too.
    const ownerPost = (await postAsPage(owner, page.id, 'Closed Monday')).body;
    expect((await request(app).put(`/posts/${ownerPost.id}`).set(auth(helper)).send({ content: 'Closed Tuesday' })).body.content).toBe('Closed Tuesday');
    expect((await request(app).delete(`/posts/${post.id}`).set(auth(helper))).status).toBe(200);
    // ...but not the owner's own, non-page posts.
    const personal = (await request(app).post('/posts').set(auth(owner)).field('content', 'my weekend')).body;
    expect((await request(app).put(`/posts/${personal.id}`).set(auth(helper)).send({ content: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/posts/${personal.id}`).set(auth(helper))).status).toBe(403);
  });

  it('only the owner deletes the page and chooses admins', async () => {
    await addAdmin(owner, page.id, helper.username);
    expect((await request(app).delete(`/pages/${page.id}`).set(auth(helper))).status).toBe(403);
    expect((await addAdmin(helper, page.id, stranger.username)).status).toBe(403);
    expect((await removeAdmin(helper, page.id, owner)).status).toBe(403);
    expect((await addAdmin(stranger, page.id, stranger.username)).status).toBe(403);
  });

  it('removed, or leaving: no more editing or posting as the page', async () => {
    await addAdmin(owner, page.id, helper.username);
    await addAdmin(owner, page.id, stranger.username);
    expect((await removeAdmin(owner, page.id, helper)).body).toEqual({ removed: true });
    expect((await postAsPage(helper, page.id, 'still me?')).status).toBe(403);
    expect((await request(app).patch(`/pages/${page.id}`).set(auth(helper)).send({ name: 'x' })).status).toBe(403);
    expect((await removeAdmin(stranger, page.id, stranger)).status).toBe(200); // leaving
    expect((await admins(owner, page.id)).body.admins).toEqual([]);
  });

  it('nobody else posts as the page', async () => {
    const res = await postAsPage(stranger, page.id, 'hijack');
    expect(res.status).toBe(403);
    expect(res.text).toBe("Only the page's owner and admins can post as this page");
  });

  it('not the owner, unknown or deactivated people, nor anyone across a block; at most 20', async () => {
    expect((await addAdmin(owner, page.id, owner.username)).text).toBe('The owner already runs this page');
    expect((await addAdmin(owner, page.id, '')).text).toBe('Enter a username');
    expect((await addAdmin(owner, page.id, 'nobody_here')).status).toBe(404);
    await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [stranger.id]);
    expect((await addAdmin(owner, page.id, stranger.username)).status).toBe(404);
    await request(app).post(`/users/${owner.id}/block`).set(auth(helper));
    expect((await addAdmin(owner, page.id, helper.username)).status).toBe(404);
    const crowd = await pool.query(
      `INSERT INTO users (username, email, password) SELECT 'crowd' || g, 'crowd' || g || '@example.com', 'x' FROM generate_series(1, 20) g RETURNING id`
    );
    await pool.query('INSERT INTO page_admins (page_id, user_id) SELECT $1, unnest($2::int[])', [page.id, crowd.rows.map((r) => r.id)]);
    const another = await registerAndLogin(app);
    const full = await addAdmin(owner, page.id, another.username);
    expect(full.status).toBe(400);
    expect(full.text).toBe('A page can have at most 20 admins');
  });

  it('in the data export', async () => {
    await addAdmin(owner, page.id, helper.username);
    const data = (await request(app).get('/profile/export').set(auth(helper))).body;
    expect(data.pages.admin_of.map((p) => p.name)).toEqual(['Corner Cafe']);
  });
});
