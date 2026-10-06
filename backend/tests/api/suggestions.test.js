const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B8 People you may know -- GET /users/suggestions.
describe('follow suggestions (B8)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const suggest = async (user) => (await request(app).get('/users/suggestions').set(auth(user))).body;
  const ids = (list) => list.map((s) => s.id);

  it('requires auth', async () => {
    expect((await request(app).get('/users/suggestions')).status).toBe(401);
  });

  it('suggests friends-of-friends ranked by mutual count, with a mutual sample', async () => {
    const me = await registerAndLogin(app);
    const f1 = await registerAndLogin(app);
    const f2 = await registerAndLogin(app);
    const popularWithFriends = await registerAndLogin(app); // followed by f1 + f2
    const knownByOne = await registerAndLogin(app); // followed by f1
    await follow(me, f1);
    await follow(me, f2);
    await follow(f1, popularWithFriends);
    await follow(f2, popularWithFriends);
    await follow(f1, knownByOne);

    const list = await suggest(me);
    expect(ids(list).slice(0, 2)).toEqual([popularWithFriends.id, knownByOne.id]);
    expect(list[0]).toMatchObject({ mutual_count: 2, reason: 'mutuals' });
    expect([...list[0].mutual_sample].sort()).toEqual([f1.username, f2.username].sort());
  });

  it('boosts people who follow you but you have not followed back', async () => {
    const me = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await follow(fan, me);
    const list = await suggest(me);
    expect(list[0]).toMatchObject({ id: fan.id, follows_you: true, reason: 'follows_you' });
  });

  it('never suggests: yourself, people you follow or requested, blocked, deactivated', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const alreadyFollowed = await registerAndLogin(app);
    const requested = await registerAndLogin(app);
    const blocked = await registerAndLogin(app);
    const gone = await registerAndLogin(app);
    await follow(me, friend);
    for (const u of [alreadyFollowed, requested, blocked, gone, me]) await follow(friend, u);
    await follow(me, alreadyFollowed);
    await request(app).put('/profile/privacy').set(auth(requested)).send({ isPrivate: true });
    await follow(me, requested); // pending
    await request(app).post(`/users/${me.id}/block`).set(auth(blocked));
    const deactivated = await request(app).post('/profile/deactivate').set(auth(gone)).send({ password: gone.password });
    expect(deactivated.status).toBe(200);

    const got = ids(await suggest(me));
    for (const u of [me, friend, alreadyFollowed, requested, blocked, gone]) expect(got).not.toContain(u.id);
  });

  it('a new account with no follows gets popular public accounts (fallback), never private ones', async () => {
    const newbie = await registerAndLogin(app);
    const star = await registerAndLogin(app);
    const minor = await registerAndLogin(app);
    const privateStar = await registerAndLogin(app);
    const fans = [await registerAndLogin(app), await registerAndLogin(app)];
    for (const f of fans) await follow(f, star);
    await follow(fans[0], minor);
    await request(app).put('/profile/privacy').set(auth(privateStar)).send({ isPrivate: true });

    const list = await suggest(newbie);
    expect(list[0]).toMatchObject({ id: star.id, reason: 'popular', follower_count: 2 });
    expect(ids(list).indexOf(star.id)).toBeLessThan(ids(list).indexOf(minor.id));
    expect(ids(list)).not.toContain(privateStar.id);
    expect(list.length).toBeLessThanOrEqual(10);
  });

  it('network suggestions come before popular ones, with no duplicates', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const fof = await registerAndLogin(app);
    await follow(me, friend);
    await follow(friend, fof);
    const list = await suggest(me);
    expect(list[0]).toMatchObject({ id: fof.id, reason: 'mutuals' });
    expect(new Set(ids(list)).size).toBe(list.length);
  });

  // Day 39: hide someone from your suggestions (the X on a card).
  describe('hiding a suggestion', () => {
    const dismiss = (user, target) => request(app).post(`/users/suggestions/${target.id}/dismiss`).set(auth(user));

    it('a hidden friend-of-friend stops being suggested; others stay', async () => {
      const me = await registerAndLogin(app);
      const friend = await registerAndLogin(app);
      const hideMe = await registerAndLogin(app);
      const keep = await registerAndLogin(app);
      await follow(me, friend);
      await follow(friend, hideMe);
      await follow(friend, keep);
      expect(ids(await suggest(me))).toEqual(expect.arrayContaining([hideMe.id, keep.id]));
      expect((await dismiss(me, hideMe)).status).toBe(204);
      const got = ids(await suggest(me));
      expect(got).not.toContain(hideMe.id);
      expect(got).toContain(keep.id);
    });

    it('also from the popular fallback', async () => {
      const newbie = await registerAndLogin(app);
      const star = await registerAndLogin(app);
      await follow(await registerAndLogin(app), star);
      expect(ids(await suggest(newbie))).toContain(star.id);
      await dismiss(newbie, star);
      expect(ids(await suggest(newbie))).not.toContain(star.id);
    });

    it('is private to the person who hid: others still get the suggestion, nobody is unfollowed', async () => {
      const me = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const star = await registerAndLogin(app);
      await follow(await registerAndLogin(app), star);
      await dismiss(me, star);
      expect(ids(await suggest(other))).toContain(star.id);
    });

    it('idempotent; refuses yourself (400), unknown people (404), bad ids (400), no login (401)', async () => {
      const me = await registerAndLogin(app);
      const x = await registerAndLogin(app);
      expect((await dismiss(me, x)).status).toBe(204);
      expect((await dismiss(me, x)).status).toBe(204);
      expect((await dismiss(me, me)).status).toBe(400);
      expect((await dismiss(me, { id: 999999 })).status).toBe(404);
      expect((await request(app).post('/users/suggestions/abc/dismiss').set(auth(me))).status).toBe(400);
      expect((await request(app).post(`/users/suggestions/${x.id}/dismiss`)).status).toBe(401);
    });

    it('the data download lists who you hid', async () => {
      const me = await registerAndLogin(app);
      const x = await registerAndLogin(app);
      await dismiss(me, x);
      const data = JSON.parse((await request(app).get('/profile/export').set(auth(me))).text);
      expect(data.hidden_suggestions).toEqual([expect.objectContaining({ username: x.username })]);
    });
  });
});
