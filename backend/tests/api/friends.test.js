const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 37: friends = people who follow each other. Connections lists
// (friends / followers / following), mutual friends, and counts.
describe('friends and connections (Day 37)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const befriend = async (a, b) => { await follow(a, b); await follow(b, a); };
  const connections = async (viewer, owner, type, query = '') => {
    const req = request(app).get(`/users/${owner.id}/connections?type=${type}${query}`);
    if (viewer) req.set(auth(viewer));
    return req;
  };
  const names = (res) => res.body.users.map((u) => u.username);

  it('friends are mutual follows only; followers and following list each side', async () => {
    const me = await registerAndLogin(app, { username: `me${Date.now()}` });
    const both = await registerAndLogin(app, { username: `aa${Date.now()}` });
    const fan = await registerAndLogin(app, { username: `bb${Date.now()}` });
    const idol = await registerAndLogin(app, { username: `cc${Date.now()}` });
    await befriend(me, both);
    await follow(fan, me);
    await follow(me, idol);
    expect(names(await connections(me, me, 'friends'))).toEqual([both.username]);
    expect(names(await connections(me, me, 'followers')).sort()).toEqual([both.username, fan.username].sort());
    expect(names(await connections(me, me, 'following')).sort()).toEqual([both.username, idol.username].sort());
    const counts = (await request(app).get(`/users/${me.id}/follow-counts`)).body;
    expect(counts).toMatchObject({ followersCount: 2, followingCount: 2, friendsCount: 1 });
  });

  it('each row says how the viewer relates to that person', async () => {
    const owner = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    const x = await registerAndLogin(app);
    const y = await registerAndLogin(app);
    await follow(x, owner);
    await follow(y, owner);
    await follow(viewer, x);   // viewer follows x
    await follow(y, viewer);   // y follows viewer
    const rows = (await connections(viewer, owner, 'followers')).body.users;
    expect(rows.find((u) => u.id === x.id)).toMatchObject({ is_following: true, follows_you: false });
    expect(rows.find((u) => u.id === y.id)).toMatchObject({ is_following: false, follows_you: true });
  });

  it('a profile says whether that person follows you (for Follow back)', async () => {
    const me = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await follow(fan, me);
    expect((await request(app).get(`/profile/${fan.id}`).set(auth(me))).body.follows_you).toBe(true);
    expect((await request(app).get(`/profile/${me.id}`).set(auth(fan))).body.follows_you).toBe(false);
    expect((await request(app).get(`/profile/${fan.id}`)).body.follows_you).toBe(false);
  });

  it('pages A-Z without gaps or repeats', async () => {
    const owner = await registerAndLogin(app);
    const fans = [];
    for (let i = 0; i < 5; i += 1) fans.push(await registerAndLogin(app));
    for (const f of fans) await follow(f, owner);
    const p1 = await connections(null, owner, 'followers', '&limit=2&page=1');
    const p2 = await connections(null, owner, 'followers', '&limit=2&page=2');
    const p3 = await connections(null, owner, 'followers', '&limit=2&page=3');
    expect(p1.body.hasMore).toBe(true);
    expect(p3.body.hasMore).toBe(false);
    const all = [...names(p1), ...names(p2), ...names(p3)];
    expect(all).toEqual(fans.map((f) => f.username).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  });

  it('deactivated accounts are hidden from lists and counts; blocked people from the viewer\'s lists', async () => {
    const owner = await registerAndLogin(app);
    const gone = await registerAndLogin(app);
    const blocked = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    await befriend(owner, gone);
    await follow(blocked, owner);
    await request(app).post('/profile/deactivate').set(auth(gone)).send({ password: gone.password });
    await request(app).post(`/users/${blocked.id}/block`).set(auth(viewer));
    expect(names(await connections(viewer, owner, 'friends'))).toEqual([]);
    expect(names(await connections(viewer, owner, 'followers'))).toEqual([]);
    expect(names(await connections(owner, owner, 'followers'))).toEqual([blocked.username]); // the owner isn't blocking anyone
    const counts = (await request(app).get(`/users/${owner.id}/follow-counts`)).body;
    expect(counts).toMatchObject({ followersCount: 1, followingCount: 0, friendsCount: 0 });
    expect((await connections(null, owner, 'followers')).body.users.map((u) => u.id)).toEqual([blocked.id]); // logged out: no block of yours applies
  });

  it('a private account\'s lists are for its followers (403); bad type (400)', async () => {
    const priv = await registerAndLogin(app);
    await request(app).put('/profile/privacy').set(auth(priv)).send({ isPrivate: true });
    const stranger = await registerAndLogin(app);
    expect((await connections(stranger, priv, 'friends')).status).toBe(403);
    expect((await connections(null, priv, 'followers')).status).toBe(403);
    expect((await connections(priv, priv, 'friends')).status).toBe(200);
    expect((await connections(priv, priv, 'enemies')).status).toBe(400);
  });

  // Day 69: the group-member picker searches the people you follow.
  it('q filters by username (any case), and % or _ are plain characters', async () => {
    const me = await registerAndLogin(app);
    const people = [];
    for (const username of ['Nadia_K', 'nadim', 'omar%x']) people.push(await registerAndLogin(app, { username }));
    for (const person of people) await follow(me, person);
    expect(names(await connections(me, me, 'following', '&q=NAD'))).toEqual(['Nadia_K', 'nadim']);
    expect(names(await connections(me, me, 'following', '&q=%25'))).toEqual(['omar%x']);
    expect(names(await connections(me, me, 'following', '&q=_'))).toEqual(['Nadia_K']);
    expect(names(await connections(me, me, 'following', '&q=nobody'))).toEqual([]);
    expect(names(await connections(me, me, 'following', '&q='))).toHaveLength(3);
  });

  describe('mutual friends', () => {
    it('counts the viewer\'s friends who are also the person\'s friends, with a sample of 3', async () => {
      const me = await registerAndLogin(app);
      const them = await registerAndLogin(app);
      const shared = [];
      for (let i = 0; i < 4; i += 1) {
        const u = await registerAndLogin(app);
        await befriend(me, u);
        await befriend(them, u);
        shared.push(u);
      }
      const onlyMine = await registerAndLogin(app);
      await befriend(me, onlyMine);
      const res = await request(app).get(`/users/${them.id}/mutual-friends`).set(auth(me));
      expect(res.body.count).toBe(4);
      expect(res.body.sample).toHaveLength(3);
      for (const s of res.body.sample) expect(shared.map((u) => u.id)).toContain(s.id);
    });

    it('a one-way follow is not a friend', async () => {
      const me = await registerAndLogin(app);
      const them = await registerAndLogin(app);
      const u = await registerAndLogin(app);
      await follow(me, u); // not mutual
      await befriend(them, u);
      expect((await request(app).get(`/users/${them.id}/mutual-friends`).set(auth(me))).body.count).toBe(0);
    });

    it('empty for yourself or logged out; private accounts as for lists', async () => {
      const me = await registerAndLogin(app);
      expect((await request(app).get(`/users/${me.id}/mutual-friends`).set(auth(me))).body).toEqual({ count: 0, sample: [] });
      expect((await request(app).get(`/users/${me.id}/mutual-friends`)).body).toEqual({ count: 0, sample: [] });
      const priv = await registerAndLogin(app);
      await request(app).put('/profile/privacy').set(auth(priv)).send({ isPrivate: true });
      expect((await request(app).get(`/users/${priv.id}/mutual-friends`).set(auth(me))).status).toBe(403);
    });
  });
});
