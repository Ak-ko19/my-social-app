const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B14 Pages, migration 027.
describe('pages (B14)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const create = (user, body) => request(app).post('/pages').set(auth(user)).send(body);
  const postAs = (user, pageId, content) => request(app).post('/posts').set(auth(user)).field('content', content).field('pageId', String(pageId));
  const follow = (user, id) => request(app).post(`/pages/${id}/follow`).set(auth(user));
  const ids = (res) => res.body.posts.map((x) => x.id);

  let owner;
  let fan;
  let other;
  beforeEach(async () => {
    owner = await registerAndLogin(app);
    fan = await registerAndLogin(app);
    other = await registerAndLogin(app);
  });

  it('creates a page owned by its creator; validates fields', async () => {
    const res = await create(owner, { name: '  Mingalar Cafe ', category: 'business', description: 'Tea & snacks' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Mingalar Cafe', category: 'business', description: 'Tea & snacks', follower_count: 0, is_owner: true, owner_id: owner.id });
    expect((await create(owner, { name: '' })).status).toBe(400);
    expect((await create(owner, { name: 'x', category: 'spaceship' })).status).toBe(400);
    expect((await create(owner, { name: 'x'.repeat(101) })).status).toBe(400);
    expect((await request(app).post('/pages').send({ name: 'anon' })).status).toBe(401);
  });

  it('follow / unfollow is idempotent and counted; owner cannot follow own page', async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    expect((await follow(fan, page.id)).body).toMatchObject({ is_following: true, follower_count: 1 });
    expect((await follow(fan, page.id)).body).toMatchObject({ is_following: true, follower_count: 1 });
    expect((await follow(owner, page.id)).status).toBe(400);
    const un = await request(app).delete(`/pages/${page.id}/follow`).set(auth(fan));
    expect(un.body).toMatchObject({ is_following: false, follower_count: 0 });
    expect((await request(app).delete(`/pages/${page.id}/follow`).set(auth(fan))).status).toBe(200);
  });

  it('only the owner can post as the page; page posts are always public', async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    expect((await postAs(fan, page.id, 'impersonating')).status).toBe(403);
    expect((await postAs(owner, 999999, 'nope')).status).toBe(403);
    expect((await postAs(owner, 'abc', 'nope')).status).toBe(400);
    const res = await request(app).post('/posts').set(auth(owner)).field('content', 'Grand opening!').field('pageId', String(page.id)).field('visibility', 'followers');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ page_id: page.id, visibility: 'public', user_id: owner.id });
  });

  it('a post cannot be in a group and on a page at once', async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'G' })).body;
    const res = await request(app).post('/posts').set(auth(owner)).field('content', 'both').field('pageId', String(page.id)).field('communityId', String(group.id));
    expect(res.status).toBe(400);
  });

  it("page posts reach followers' home feed (with the page attached), not the owner's followers", async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    await request(app).post(`/users/${owner.id}/follow`).set(auth(other)); // follows the person, not the page
    await follow(fan, page.id);
    const pp = (await postAs(owner, page.id, 'Todays special')).body;
    const personal = (await request(app).post('/posts').set(auth(owner)).field('content', 'my own life')).body;

    const fanFeed = await request(app).get('/feed').set(auth(fan));
    expect(ids(fanFeed)).toEqual([pp.id]);
    expect(fanFeed.body.posts[0].page).toEqual({ id: page.id, name: 'Cafe', verified: false });
    expect(ids(await request(app).get('/feed').set(auth(other)))).toEqual([personal.id]);
  });

  it("page posts are on the page, public listings and post detail, but not the owner's profile Posts tab", async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    const pp = (await postAs(owner, page.id, 'pagesecretword #cafetag')).body;

    const pagePosts = await request(app).get(`/pages/${page.id}/posts`); // logged out
    expect(pagePosts.status).toBe(200);
    expect(ids(pagePosts)).toEqual([pp.id]);
    expect(pagePosts.body.posts[0].page).toEqual({ id: page.id, name: 'Cafe', verified: false });

    expect(ids(await request(app).get('/posts').set(auth(other)))).toContain(pp.id);
    expect(ids(await request(app).get('/hashtags/cafetag/posts').set(auth(other)))).toContain(pp.id);
    const search = await request(app).get('/search/posts').query({ q: 'pagesecretword' }).set(auth(other));
    expect(ids(search)).toContain(pp.id);
    expect(search.body.posts[0].page).toEqual({ id: page.id, name: 'Cafe', verified: false });
    const detail = await request(app).get(`/posts/${pp.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.page).toEqual({ id: page.id, name: 'Cafe', verified: false });

    expect(ids(await request(app).get(`/users/${owner.id}/posts`).set(auth(owner)))).not.toContain(pp.id);
  });

  it("page posts stay public when the owner's personal account is private", async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    const pp = (await postAs(owner, page.id, 'still public')).body;
    const personal = (await request(app).post('/posts').set(auth(owner)).field('content', 'private life')).body;
    await request(app).put('/profile/privacy').set(auth(owner)).send({ isPrivate: true });

    expect((await request(app).get(`/posts/${pp.id}`).set(auth(other))).status).toBe(200);
    expect((await request(app).get(`/posts/${personal.id}`).set(auth(other))).status).toBe(404);
    const all = ids(await request(app).get('/posts').set(auth(other)));
    expect(all).toContain(pp.id);
    expect(all).not.toContain(personal.id);
    // Likes/comments go through the same visibility check.
    expect((await request(app).post(`/posts/${pp.id}/like`).set(auth(other))).status).toBeLessThan(300);
  });

  it('page post audience cannot be changed', async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    const pp = (await postAs(owner, page.id, 'x')).body;
    expect((await request(app).put(`/posts/${pp.id}`).set(auth(owner)).send({ visibility: 'followers' })).status).toBe(400);
    expect((await request(app).put(`/posts/${pp.id}`).set(auth(owner)).send({ content: 'edited' })).status).toBe(200);
  });

  it('only the owner can edit or delete a page; deleting removes its posts', async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    const pp = (await postAs(owner, page.id, 'bye')).body;
    expect((await request(app).patch(`/pages/${page.id}`).set(auth(fan)).send({ name: 'Mine now' })).status).toBe(403);
    const edited = await request(app).patch(`/pages/${page.id}`).set(auth(owner)).send({ name: 'Cafe 2', category: 'brand' });
    expect(edited.body).toMatchObject({ name: 'Cafe 2', category: 'brand' });
    expect((await request(app).patch(`/pages/${page.id}`).set(auth(owner)).send({})).status).toBe(400);
    expect((await request(app).delete(`/pages/${page.id}`).set(auth(fan))).status).toBe(403);
    expect((await request(app).delete(`/pages/${page.id}`).set(auth(owner))).body).toEqual({ deleted: true });
    expect((await request(app).get(`/pages/${page.id}`)).status).toBe(404);
    expect((await request(app).get(`/posts/${pp.id}`)).status).toBe(404);
  });

  it('lists owned / following / discover with search', async () => {
    const a = (await create(owner, { name: 'Alpha Bakery' })).body;
    const b = (await create(other, { name: 'Beta Books' })).body;
    const c = (await create(other, { name: 'Gamma Gym' })).body;
    await follow(owner, b.id);
    const list = (await request(app).get('/pages').set(auth(owner))).body;
    expect(list.owned.map((p) => p.id)).toEqual([a.id]);
    expect(list.following.map((p) => p.id)).toEqual([b.id]);
    expect(list.discover.map((p) => p.id)).toEqual([c.id]);
    const found = (await request(app).get('/pages').query({ q: 'gym' }).set(auth(owner))).body;
    expect(found.discover.map((p) => p.id)).toEqual([c.id]);
    expect(found.owned).toEqual([]);
    expect((await request(app).get('/pages').query({ q: '%' }).set(auth(owner))).body.discover).toEqual([]);
  });

  it('a block with the owner hides the page and its posts (both directions)', async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    await follow(fan, page.id);
    const pp = (await postAs(owner, page.id, 'hidden soon')).body;
    await request(app).post(`/users/${fan.id}/block`).set(auth(owner));

    expect((await request(app).get(`/pages/${page.id}`).set(auth(fan))).status).toBe(404);
    expect((await request(app).get(`/pages/${page.id}/posts`).set(auth(fan))).status).toBe(404);
    expect((await request(app).get(`/posts/${pp.id}`).set(auth(fan))).status).toBe(404);
    expect(ids(await request(app).get('/feed').set(auth(fan)))).not.toContain(pp.id);
    expect((await request(app).get('/pages').set(auth(fan))).body.following).toEqual([]);
    // Unfollow still works while hidden.
    expect((await request(app).delete(`/pages/${page.id}/follow`).set(auth(fan))).status).toBe(200);
  });

  it("a deactivated owner's page is hidden from others but not from the owner", async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    await request(app).post('/profile/deactivate').set(auth(owner)).send({ password: owner.password });
    expect((await request(app).get(`/pages/${page.id}`).set(auth(fan))).status).toBe(404);
    expect((await request(app).get('/pages').set(auth(fan))).body.discover).toEqual([]);
  });

  it('invalid and unknown ids', async () => {
    expect((await request(app).get('/pages/abc')).status).toBe(400);
    expect((await request(app).get('/pages/999999')).status).toBe(404);
    expect((await follow(fan, 999999)).status).toBe(404);
  });

  it('deleting the owner account removes their pages (cascade)', async () => {
    const page = (await create(owner, { name: 'Cafe' })).body;
    await follow(fan, page.id);
    const del = await request(app).delete('/profile').set(auth(owner)).send({ password: owner.password });
    expect(del.status).toBe(200);
    expect((await request(app).get(`/pages/${page.id}`).set(auth(fan))).status).toBe(404);
  });
});
