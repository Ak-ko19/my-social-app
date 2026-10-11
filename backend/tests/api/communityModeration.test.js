const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 50: group moderation -- "Remove and ban" (migration 061), only
// members comment on and react to a group's posts, deleting a group.
describe('group moderation (Day 50)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const create = (user, body) => request(app).post('/communities').set(auth(user)).send(body);
  const join = (user, id) => request(app).post(`/communities/${id}/join`).set(auth(user));
  const ban = (user, id, target) => request(app).post(`/communities/${id}/bans/${target.id ?? target}`).set(auth(user));
  const unban = (user, id, target) => request(app).delete(`/communities/${id}/bans/${target.id}`).set(auth(user));
  const bans = (user, id, query = '') => request(app).get(`/communities/${id}/bans${query}`).set(auth(user));
  const members = async (id, user) => (await request(app).get(`/communities/${id}/members`).set(auth(user))).body.members.map((m) => m.id);
  const postIn = async (user, id, content) => (await request(app).post('/posts').set(auth(user)).field('content', content).field('communityId', String(id))).body;

  let admin;
  let troll;
  beforeEach(async () => {
    admin = await registerAndLogin(app);
    troll = await registerAndLogin(app);
  });

  it('removes a member and keeps them out until unbanned', async () => {
    const group = (await create(admin, { name: 'Hikers' })).body;
    await join(troll, group.id);
    const res = await ban(admin, group.id, troll);
    expect(res.status).toBe(201);
    expect(await members(group.id, admin)).toEqual([admin.id]);
    const again = await join(troll, group.id);
    expect(again.status).toBe(403);
    expect(again.text).toBe("You can't join this group");
    // Banning twice is harmless; the list shows them.
    expect((await ban(admin, group.id, troll)).status).toBe(201);
    const list = (await bans(admin, group.id)).body;
    expect(list.bans.map((b) => b.username)).toEqual([troll.username]);
    expect(list.hasMore).toBe(false);
    expect((await unban(admin, group.id, troll)).body).toEqual({ banned: false });
    expect((await join(troll, group.id)).status).toBe(201);
    expect(await members(group.id, admin)).toEqual([admin.id, troll.id]);
  });

  it('turns down a pending request, and works on someone not in the group yet', async () => {
    const group = (await create(admin, { name: 'Quiet', privacy: 'private' })).body;
    await join(troll, group.id);
    await ban(admin, group.id, troll);
    expect((await request(app).get(`/communities/${group.id}/requests`).set(auth(admin))).body.requests).toEqual([]);
    expect((await join(troll, group.id)).status).toBe(403);
    const stranger = await registerAndLogin(app);
    expect((await ban(admin, group.id, stranger)).status).toBe(201);
    expect((await join(stranger, group.id)).status).toBe(403);
  });

  it('only admins; never yourself or another admin; unknown people 404', async () => {
    const group = (await create(admin, { name: 'Hikers' })).body;
    const coAdmin = await registerAndLogin(app);
    await join(coAdmin, group.id);
    await join(troll, group.id);
    await request(app).put(`/communities/${group.id}/members/${coAdmin.id}/role`).set(auth(admin)).send({ role: 'admin' });
    const byMember = await ban(troll, group.id, coAdmin);
    expect(byMember.status).toBe(403);
    expect((await bans(troll, group.id)).status).toBe(403);
    expect((await unban(troll, group.id, troll)).status).toBe(403);
    expect((await ban(admin, group.id, admin)).text).toBe("You can't ban yourself");
    const onAdmin = await ban(admin, group.id, coAdmin);
    expect(onAdmin.status).toBe(400);
    expect(onAdmin.text).toBe('Make this admin a member before banning them');
    expect((await ban(admin, group.id, 999999)).status).toBe(404);
    expect((await ban(admin, group.id, 'x')).status).toBe(400);
    expect(await members(group.id, admin)).toEqual([admin.id, coAdmin.id, troll.id]);
  });

  it('pages the bans list, newest first', async () => {
    const group = (await create(admin, { name: 'Busy' })).body;
    const people = [];
    for (let i = 0; i < 3; i += 1) {
      const person = await registerAndLogin(app);
      people.push(person);
      await ban(admin, group.id, person);
    }
    const first = (await bans(admin, group.id, '?limit=2')).body;
    expect(first.bans.map((b) => b.id)).toEqual([people[2].id, people[1].id]);
    expect(first.hasMore).toBe(true);
    const second = (await bans(admin, group.id, '?limit=2&page=2')).body;
    expect(second.bans.map((b) => b.id)).toEqual([people[0].id]);
    expect(second.hasMore).toBe(false);
  });

  it('only members comment on and react to a public group\'s posts; anyone can read them', async () => {
    const group = (await create(admin, { name: 'Open' })).body;
    const post = await postIn(admin, group.id, 'Welcome!');
    const outsider = troll;
    expect((await request(app).get(`/posts/${post.id}`).set(auth(outsider))).status).toBe(200);
    const comment = await request(app).post(`/posts/${post.id}/comments`).set(auth(outsider)).send({ content: 'hi' });
    expect(comment.status).toBe(403);
    expect(comment.text).toBe('Join this group to comment and react');
    expect((await request(app).put(`/posts/${post.id}/reaction`).set(auth(outsider)).send({ reaction: 'love' })).status).toBe(403);
    expect((await request(app).post(`/posts/${post.id}/like`).set(auth(outsider))).status).toBe(403);
    const adminComment = (await request(app).post(`/posts/${post.id}/comments`).set(auth(admin)).send({ content: 'rules: be kind' })).body;
    expect((await request(app).post(`/comments/${adminComment.id}/like`).set(auth(outsider))).status).toBe(403);

    // A member can; after a ban they can't, but may take back their reaction.
    await join(troll, group.id);
    expect((await request(app).post(`/posts/${post.id}/comments`).set(auth(troll)).send({ content: 'hi' })).status).toBe(201);
    expect((await request(app).put(`/posts/${post.id}/reaction`).set(auth(troll)).send({ reaction: 'love' })).status).toBe(201);
    expect((await request(app).post(`/comments/${adminComment.id}/like`).set(auth(troll))).status).toBe(201);
    await ban(admin, group.id, troll);
    expect((await request(app).post(`/posts/${post.id}/comments`).set(auth(troll)).send({ content: 'again' })).status).toBe(403);
    expect((await request(app).delete(`/posts/${post.id}/like`).set(auth(troll))).status).toBe(200);
    expect((await request(app).delete(`/comments/${adminComment.id}/like`).set(auth(troll))).status).toBe(200);
  });

  it('a normal post is unaffected', async () => {
    const post = await postIn(admin, '', 'Just me');
    expect((await request(app).post(`/posts/${post.id}/comments`).set(auth(troll)).send({ content: 'nice' })).status).toBe(201);
  });

  // Day 50 step 3: every group list is paged.
  describe('paged lists', () => {
    const { pool } = require('../helpers/testDb');

    it('members: admins first, then by join date, a page at a time', async () => {
      const group = (await create(admin, { name: 'Big' })).body;
      const people = [];
      for (let i = 0; i < 3; i += 1) {
        const person = await registerAndLogin(app);
        people.push(person);
        await join(person, group.id);
      }
      // The last to join is made an admin: admins come first.
      await request(app).put(`/communities/${group.id}/members/${people[2].id}/role`).set(auth(admin)).send({ role: 'admin' });
      const get = (query) => request(app).get(`/communities/${group.id}/members${query}`).set(auth(admin));
      const first = (await get('?limit=2')).body;
      expect(first.members.map((m) => m.id)).toEqual([admin.id, people[2].id]);
      expect(first).toMatchObject({ page: 1, hasMore: true });
      const second = (await get('?limit=2&page=2')).body;
      expect(second.members.map((m) => m.id)).toEqual([people[0].id, people[1].id]);
      expect(second.hasMore).toBe(false);
    });

    it('requests: oldest first, paged, with the total for the heading', async () => {
      const group = (await create(admin, { name: 'Closed', privacy: 'private' })).body;
      const people = [];
      for (let i = 0; i < 3; i += 1) {
        const person = await registerAndLogin(app);
        people.push(person);
        await join(person, group.id);
      }
      const get = (query) => request(app).get(`/communities/${group.id}/requests${query}`).set(auth(admin));
      const first = (await get('?limit=2')).body;
      expect(first.requests.map((r) => r.id)).toEqual([people[0].id, people[1].id]);
      expect(first).toMatchObject({ page: 1, hasMore: true, total: 3 });
      expect(first.requests[0].total).toBeUndefined();
      const past = (await get('?limit=2&page=9')).body;
      expect(past).toEqual({ requests: [], page: 9, hasMore: false, total: 3 });
    });

    it('groups: yours and the rest, each paged; more of one with ?section=', async () => {
      const mine = [];
      for (let i = 0; i < 3; i += 1) mine.push((await create(admin, { name: `Mine ${i}` })).body);
      for (let i = 0; i < 3; i += 1) await create(troll, { name: `Theirs ${i}` });
      // Your groups are newest-joined first, whatever their size.
      await join(troll, mine[0].id);
      const list = (await request(app).get('/communities?limit=2').set(auth(admin))).body;
      expect(list.mine.map((g) => g.name)).toEqual(['Mine 2', 'Mine 1']);
      expect(list.mineHasMore).toBe(true);
      expect(list.discover).toHaveLength(2);
      expect(list.discoverHasMore).toBe(true);
      const more = (await request(app).get('/communities?section=mine&page=2&limit=2').set(auth(admin))).body;
      expect(more).toEqual({ groups: [expect.objectContaining({ name: 'Mine 0' })], page: 2, hasMore: false });
      expect((await request(app).get('/communities?section=all').set(auth(admin))).status).toBe(400);
      const search = (await request(app).get('/communities?section=discover&q=theirs 1').set(auth(admin))).body;
      expect(search.groups.map((g) => g.name)).toEqual(['Theirs 1']);
    });

    it('your groups never drop out because the site has many bigger ones', async () => {
      const own = (await create(admin, { name: 'Tiny club' })).body;
      // 120 other groups, each with one member (more than the old top-100 cut).
      await pool.query(
        `WITH c AS (INSERT INTO communities (name, created_by) SELECT 'Other ' || g, $1 FROM generate_series(1, 120) g RETURNING id)
         INSERT INTO community_members (community_id, user_id, role) SELECT id, $1, 'admin' FROM c`,
        [troll.id]
      );
      const list = (await request(app).get('/communities').set(auth(admin))).body;
      expect(list.mine.map((g) => g.id)).toEqual([own.id]);
    });
  });

  // Day 50 step 4: group notifications.
  describe('notifications', () => {
    const { pool } = require('../helpers/testDb');
    const inbox = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications
      .map((n) => ({ type: n.type, from: n.actor_username, group: n.community_name, groupId: n.community_id }));
    let group;
    let coAdmin;
    beforeEach(async () => {
      group = (await create(admin, { name: 'Night Owls', privacy: 'private' })).body;
      coAdmin = await registerAndLogin(app);
      await join(coAdmin, group.id);
      await request(app).post(`/communities/${group.id}/requests/${coAdmin.id}/approve`).set(auth(admin));
      await request(app).put(`/communities/${group.id}/members/${coAdmin.id}/role`).set(auth(admin)).send({ role: 'admin' });
      await pool.query('DELETE FROM notifications');
    });
    const request1 = (who) => ({ type: 'group_request', from: who.username, group: 'Night Owls', groupId: group.id });

    it('a request tells every admin (not plain members), once; approving tells the person and clears it', async () => {
      const plain = await registerAndLogin(app);
      await join(plain, group.id);
      await request(app).post(`/communities/${group.id}/requests/${plain.id}/approve`).set(auth(admin));
      await pool.query('DELETE FROM notifications');
      // The double click: two at once, and one more after.
      await Promise.all([join(troll, group.id), join(troll, group.id)]);
      await join(troll, group.id);
      expect(await inbox(admin)).toEqual([request1(troll)]);
      expect(await inbox(coAdmin)).toEqual([request1(troll)]);
      expect(await inbox(plain)).toEqual([]);
      await request(app).post(`/communities/${group.id}/requests/${troll.id}/approve`).set(auth(coAdmin));
      expect(await inbox(troll)).toEqual([{ type: 'group_approved', from: coAdmin.username, group: 'Night Owls', groupId: group.id }]);
      expect(await inbox(admin)).toEqual([]);
      expect(await inbox(coAdmin)).toEqual([]);
    });

    it('a request turned down, cancelled or banned is cleared; going public clears them all', async () => {
      const others = [troll, await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
      for (const person of others) await join(person, group.id);
      expect(await inbox(admin)).toHaveLength(4);
      await request(app).delete(`/communities/${group.id}/members/${others[0].id}`).set(auth(admin)); // turned down
      await request(app).delete(`/communities/${group.id}/members/${others[1].id}`).set(auth(others[1])); // cancelled
      await ban(admin, group.id, others[2]);
      expect(await inbox(admin)).toEqual([request1(others[3])]);
      await request(app).patch(`/communities/${group.id}`).set(auth(admin)).send({ privacy: 'public' });
      expect(await inbox(admin)).toEqual([]);
    });

    it('not for a public group, not to an admin who blocked them, not with Groups switched off', async () => {
      const open = (await create(admin, { name: 'Open' })).body;
      await join(troll, open.id);
      expect(await inbox(admin)).toEqual([]);
      await request(app).post(`/users/${troll.id}/block`).set(auth(coAdmin));
      await request(app).put('/notification-preferences').set(auth(admin)).send({ groups: false });
      await join(troll, group.id);
      expect(await inbox(admin)).toEqual([]);
      expect(await inbox(coAdmin)).toEqual([]);
      expect((await request(app).get('/notification-preferences').set(auth(admin))).body.groups).toBe(false);
    });

    it('go with the group when it is deleted', async () => {
      await join(troll, group.id);
      await request(app).delete(`/communities/${group.id}`).set(auth(admin));
      expect(await inbox(coAdmin)).toEqual([]);
    });
  });

  // Day 50 step 2: an admin deletes the group.
  describe('delete a group', () => {
    const remove = (user, id) => request(app).delete(`/communities/${id}`).set(auth(user));

    it('an admin deletes it for everyone, with its posts; nobody else can', async () => {
      const group = (await create(admin, { name: 'Old club' })).body;
      await join(troll, group.id);
      const post = await postIn(troll, group.id, 'bye');
      const stranger = await registerAndLogin(app);
      expect((await remove(troll, group.id)).status).toBe(403);
      expect((await remove(stranger, group.id)).status).toBe(403);
      expect((await request(app).delete(`/communities/${group.id}`)).status).toBe(401);
      expect((await remove(admin, group.id)).body).toEqual({ deleted: true });
      expect((await request(app).get(`/communities/${group.id}`).set(auth(admin))).status).toBe(404);
      expect((await request(app).get(`/posts/${post.id}`).set(auth(troll))).status).toBe(404);
      expect((await remove(admin, group.id)).status).toBe(404);
      expect((await remove(admin, 'x')).status).toBe(400);
    });

    it('any admin may, not only the creator', async () => {
      const group = (await create(admin, { name: 'Shared' })).body;
      await join(troll, group.id);
      await request(app).put(`/communities/${group.id}/members/${troll.id}/role`).set(auth(admin)).send({ role: 'admin' });
      expect((await remove(troll, group.id)).status).toBe(200);
    });
  });
});
