const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B13 Groups ("communities"), migration 026.
describe('groups / communities (B13)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const create = (user, body) => request(app).post('/communities').set(auth(user)).send(body);
  const join = (user, id) => request(app).post(`/communities/${id}/join`).set(auth(user));
  const postIn = (user, id, content) => request(app).post('/posts').set(auth(user)).field('content', content).field('communityId', String(id));
  const feed = (user, id) => request(app).get(`/communities/${id}/posts`).set(user ? auth(user) : {});

  let owner;
  let member;
  let outsider;
  beforeEach(async () => {
    owner = await registerAndLogin(app);
    member = await registerAndLogin(app);
    outsider = await registerAndLogin(app);
  });

  it('creates a group; creator is its admin member', async () => {
    const res = await create(owner, { name: '  Hikers  ', description: 'Trails', privacy: 'public' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Hikers', description: 'Trails', privacy: 'public', member_count: 1, my_role: 'admin', is_admin: true });
    expect((await create(owner, { name: '' })).status).toBe(400);
    expect((await create(owner, { name: 'x', privacy: 'secret' })).status).toBe(400);
  });

  describe('public group', () => {
    let g;
    beforeEach(async () => {
      g = (await create(owner, { name: 'Hikers' })).body;
    });

    it('joining is instant; members can post; posts show in the group feed (even logged out)', async () => {
      const joined = await join(member, g.id);
      expect(joined.body).toMatchObject({ is_member: true, member_count: 2 });
      const p = await postIn(member, g.id, 'trail report');
      expect(p.status).toBe(201);
      expect(p.body.community_id).toBe(g.id);
      expect((await feed(null, g.id)).body.posts.map((x) => x.content)).toEqual(['trail report']);
    });

    it('non-members cannot post in it (403)', async () => {
      expect((await postIn(outsider, g.id, 'let me in')).status).toBe(403);
    });

    it('group posts stay out of global listings (discovery, home feed, profile, hashtag, search, explore)', async () => {
      await join(member, g.id);
      await request(app).post(`/users/${member.id}/follow`).set(auth(outsider));
      const gp = (await postIn(member, g.id, 'groupsecretword #grouptag')).body;
      await request(app).post(`/posts/${gp.id}/like`).set(auth(owner)); // engagement for explore

      const ids = (res) => res.body.posts.map((x) => x.id);
      expect(ids(await request(app).get('/posts').set(auth(outsider)))).not.toContain(gp.id);
      expect(ids(await request(app).get('/feed').set(auth(outsider)))).not.toContain(gp.id);
      expect(ids(await request(app).get(`/users/${member.id}/posts`).set(auth(outsider)))).not.toContain(gp.id);
      expect(ids(await request(app).get('/hashtags/grouptag/posts').set(auth(outsider)))).not.toContain(gp.id);
      expect(ids(await request(app).get('/search/posts').query({ q: 'groupsecretword' }).set(auth(outsider)))).not.toContain(gp.id);
      expect(ids(await request(app).get('/explore/posts').set(auth(outsider)))).not.toContain(gp.id);
      // ...but it's still directly viewable (public group).
      expect((await request(app).get(`/posts/${gp.id}`).set(auth(outsider))).status).toBe(200);
    });
  });

  describe('private group', () => {
    let g;
    let secret;
    beforeEach(async () => {
      g = (await create(owner, { name: 'Inner circle', privacy: 'private' })).body;
      secret = (await postIn(owner, g.id, 'members only')).body;
    });

    it('basic info is visible; posts and members are not, to outsiders and anonymous', async () => {
      const info = await request(app).get(`/communities/${g.id}`).set(auth(outsider));
      expect(info.body).toMatchObject({ name: 'Inner circle', privacy: 'private', member_count: 1, can_read: false });
      expect((await feed(outsider, g.id)).status).toBe(403);
      expect((await feed(null, g.id)).status).toBe(403);
      expect((await request(app).get(`/communities/${g.id}/members`).set(auth(outsider))).status).toBe(403);
    });

    it('its posts are hidden everywhere by id: view, like, comment, bookmark (404)', async () => {
      expect((await request(app).get(`/posts/${secret.id}`).set(auth(outsider))).status).toBe(404);
      expect((await request(app).post(`/posts/${secret.id}/like`).set(auth(outsider))).status).toBe(404);
      expect((await request(app).post(`/posts/${secret.id}/comments`).set(auth(outsider)).send({ content: 'x' })).status).toBe(404);
      expect((await request(app).post(`/posts/${secret.id}/bookmark`).set(auth(outsider))).status).toBe(404);
    });

    it('join -> pending request; admin approves -> member can read and post', async () => {
      const req1 = await join(member, g.id);
      expect(req1.body).toMatchObject({ my_status: 'pending', is_member: false, can_read: false });
      expect((await postIn(member, g.id, 'too soon')).status).toBe(403);

      const pending = await request(app).get(`/communities/${g.id}/requests`).set(auth(owner));
      expect(pending.body.map((r) => r.id)).toEqual([member.id]);
      expect((await request(app).get(`/communities/${g.id}/requests`).set(auth(member))).status).toBe(403);

      expect((await request(app).post(`/communities/${g.id}/requests/${member.id}/approve`).set(auth(owner))).status).toBe(200);
      expect((await feed(member, g.id)).body.posts.map((p) => p.content)).toEqual(['members only']);
      expect((await postIn(member, g.id, 'hello')).status).toBe(201);
    });

    it('deny (= remove the request); a bookmark of a group post disappears after leaving', async () => {
      await join(member, g.id);
      expect((await request(app).delete(`/communities/${g.id}/members/${member.id}`).set(auth(owner))).status).toBe(200);
      expect((await request(app).get(`/communities/${g.id}/requests`).set(auth(owner))).body).toEqual([]);

      await join(member, g.id);
      await request(app).post(`/communities/${g.id}/requests/${member.id}/approve`).set(auth(owner));
      await request(app).post(`/posts/${secret.id}/bookmark`).set(auth(member));
      expect((await request(app).get('/bookmarks').set(auth(member))).body.posts.map((p) => p.id)).toContain(secret.id);
      await request(app).delete(`/communities/${g.id}/members/${member.id}`).set(auth(member));
      expect((await request(app).get('/bookmarks').set(auth(member))).body.posts.map((p) => p.id)).not.toContain(secret.id);
    });

    it('switching the group to public admits pending requests', async () => {
      await join(member, g.id);
      const res = await request(app).patch(`/communities/${g.id}`).set(auth(owner)).send({ privacy: 'public' });
      expect(res.body).toMatchObject({ privacy: 'public', member_count: 2 });
    });
  });

  describe('admin powers and succession', () => {
    let g;
    beforeEach(async () => {
      g = (await create(owner, { name: 'Club' })).body;
      await join(member, g.id);
    });

    it('admins delete any post in the group; members only their own', async () => {
      const mine = (await postIn(member, g.id, 'member post')).body;
      const theirs = (await postIn(owner, g.id, 'owner post')).body;
      expect((await request(app).delete(`/posts/${theirs.id}`).set(auth(member))).status).toBe(403);
      expect((await request(app).delete(`/posts/${mine.id}`).set(auth(owner))).status).toBe(200);
    });

    it('only admins edit, remove members, or change roles', async () => {
      expect((await request(app).patch(`/communities/${g.id}`).set(auth(member)).send({ name: 'Mine' })).status).toBe(403);
      expect((await request(app).delete(`/communities/${g.id}/members/${owner.id}`).set(auth(member))).status).toBe(403);
      expect((await request(app).put(`/communities/${g.id}/members/${member.id}/role`).set(auth(owner)).send({ role: 'admin' })).status).toBe(200);
      expect((await request(app).get(`/communities/${g.id}`).set(auth(member))).body.is_admin).toBe(true);
    });

    it('the last admin leaving promotes the longest-standing member; the last member leaving deletes the group', async () => {
      await request(app).delete(`/communities/${g.id}/members/${owner.id}`).set(auth(owner));
      expect((await request(app).get(`/communities/${g.id}`).set(auth(member))).body).toMatchObject({ is_admin: true, member_count: 1 });
      const last = await request(app).delete(`/communities/${g.id}/members/${member.id}`).set(auth(member));
      expect(last.body.deleted).toBe(true);
      expect((await request(app).get(`/communities/${g.id}`).set(auth(member))).status).toBe(404);
    });

    it('demoting the only admin re-promotes someone (never admin-less)', async () => {
      await request(app).put(`/communities/${g.id}/members/${owner.id}/role`).set(auth(owner)).send({ role: 'member' });
      const members = (await request(app).get(`/communities/${g.id}/members`).set(auth(owner))).body;
      expect(members.filter((m) => m.role === 'admin')).toHaveLength(1);
    });
  });

  it('GET /communities splits mine (incl. pending) from discover', async () => {
    const pub = (await create(owner, { name: 'Open' })).body;
    const priv = (await create(owner, { name: 'Closed', privacy: 'private' })).body;
    await join(member, priv.id);
    const res = await request(app).get('/communities').set(auth(member));
    expect(res.body.mine.map((c) => [c.name, c.my_status])).toEqual([['Closed', 'pending']]);
    expect(res.body.discover.map((c) => c.id)).toEqual([pub.id]);
    const search = await request(app).get('/communities').query({ q: 'clo' }).set(auth(outsider));
    expect(search.body.discover.map((c) => c.name)).toEqual(['Closed']);
  });
});
