const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 113 (migration 092): a group's member count and a page's follower
// count are stored columns kept right by triggers. Every way in or out must
// move them -- checked against a real count after each step.
describe('stored member and follower counts', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const realMembers = async (id) => Number((await pool.query(
    "SELECT count(*) FROM community_members WHERE community_id = $1 AND status = 'member'", [id])).rows[0].count);
  const realFollowers = async (id) => Number((await pool.query('SELECT count(*) FROM page_follows WHERE page_id = $1', [id])).rows[0].count);
  // What the app shows, and that it is the truth.
  const groupCount = async (id, viewer) => {
    const shown = (await request(app).get(`/communities/${id}`).set(auth(viewer))).body.member_count;
    expect(shown).toBe(await realMembers(id));
    return shown;
  };
  const pageCount = async (id, viewer) => {
    const shown = (await request(app).get(`/pages/${id}`).set(auth(viewer))).body.follower_count;
    expect(shown).toBe(await realFollowers(id));
    return shown;
  };
  const deleteAccount = (user) => request(app).delete('/profile').set(auth(user)).send({ password: user.password });

  it('a group: join, ask, approve, leave, remove, ban and a deleted account all move the count', async () => {
    const owner = await registerAndLogin(app);
    const [a, b, c, d] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    const g = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Counted', privacy: 'private' })).body;
    expect(await groupCount(g.id, owner)).toBe(1);

    // Asking to join a private group is not membership yet.
    for (const u of [a, b, c, d]) expect((await request(app).post(`/communities/${g.id}/join`).set(auth(u))).status).toBeLessThan(300);
    expect(await groupCount(g.id, owner)).toBe(1);
    for (const u of [a, b, c, d]) {
      expect((await request(app).post(`/communities/${g.id}/requests/${u.id}/approve`).set(auth(owner))).status).toBe(200);
    }
    expect(await groupCount(g.id, owner)).toBe(5);
    // Approving twice counts once.
    await request(app).post(`/communities/${g.id}/requests/${a.id}/approve`).set(auth(owner));
    expect(await groupCount(g.id, owner)).toBe(5);
    // A role change is not a new member.
    await request(app).put(`/communities/${g.id}/members/${a.id}/role`).set(auth(owner)).send({ role: 'admin' });
    expect(await groupCount(g.id, owner)).toBe(5);

    expect((await request(app).delete(`/communities/${g.id}/members/${a.id}`).set(auth(a))).status).toBe(200); // leaves
    expect(await groupCount(g.id, owner)).toBe(4);
    expect((await request(app).delete(`/communities/${g.id}/members/${b.id}`).set(auth(owner))).status).toBe(200); // removed
    expect(await groupCount(g.id, owner)).toBe(3);
    expect((await request(app).post(`/communities/${g.id}/bans/${c.id}`).set(auth(owner))).status).toBeLessThan(300); // banned
    expect(await groupCount(g.id, owner)).toBe(2);
    expect((await deleteAccount(d)).status).toBe(200); // the account is gone (cascade)
    expect(await groupCount(g.id, owner)).toBe(1);
  });

  it('a page: follow, follow again, unfollow and a deleted account move the count', async () => {
    const owner = await registerAndLogin(app);
    const [a, b] = [await registerAndLogin(app), await registerAndLogin(app)];
    const p = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Counted page', category: 'business' })).body;
    expect(await pageCount(p.id, owner)).toBe(0);
    await request(app).post(`/pages/${p.id}/follow`).set(auth(a));
    await request(app).post(`/pages/${p.id}/follow`).set(auth(a)); // twice: still one
    await request(app).post(`/pages/${p.id}/follow`).set(auth(b));
    expect(await pageCount(p.id, owner)).toBe(2);
    await request(app).delete(`/pages/${p.id}/follow`).set(auth(a));
    expect(await pageCount(p.id, owner)).toBe(1);
    expect((await deleteAccount(b)).status).toBe(200);
    expect(await pageCount(p.id, owner)).toBe(0);
  });

  it('Discover lists the most-joined groups and most-followed pages first, by the stored counts', async () => {
    const viewer = await registerAndLogin(app);
    const people = [];
    for (let i = 0; i < 3; i += 1) people.push(await registerAndLogin(app));
    const small = (await request(app).post('/communities').set(auth(people[0])).send({ name: 'Small group' })).body;
    const big = (await request(app).post('/communities').set(auth(people[0])).send({ name: 'Big group' })).body;
    for (const u of people.slice(1)) await request(app).post(`/communities/${big.id}/join`).set(auth(u));
    const groups = (await request(app).get('/communities?section=discover').set(auth(viewer))).body.groups;
    expect(groups.map((x) => [x.id, x.member_count])).toEqual([[big.id, 3], [small.id, 1]]);

    const quiet = (await request(app).post('/pages').set(auth(people[0])).send({ name: 'Quiet page', category: 'business' })).body;
    const loved = (await request(app).post('/pages').set(auth(people[0])).send({ name: 'Loved page', category: 'business' })).body;
    for (const u of people.slice(1)) await request(app).post(`/pages/${loved.id}/follow`).set(auth(u));
    const pages = (await request(app).get('/pages?section=discover').set(auth(viewer))).body.pages;
    expect(pages.map((x) => [x.id, x.follower_count])).toEqual([[loved.id, 2], [quiet.id, 0]]);
  });

  it('a person: follow, a request (counted once accepted), unfollow, a refused request and a deleted follower', async () => {
    const realOf = async (id) => Number((await pool.query(
      "SELECT count(*) FROM follows WHERE following_id = $1 AND status = 'accepted'", [id])).rows[0].count);
    const stored = async (id) => {
      const n = (await pool.query('SELECT follower_count FROM users WHERE id = $1', [id])).rows[0].follower_count;
      expect(n).toBe(await realOf(id));
      return n;
    };
    const star = await registerAndLogin(app);
    const [a, b, c] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    await request(app).post(`/users/${star.id}/follow`).set(auth(a));
    await request(app).post(`/users/${star.id}/follow`).set(auth(a)); // twice: still one
    expect(await stored(star.id)).toBe(1);
    await request(app).put('/profile/privacy').set(auth(star)).send({ isPrivate: true });
    await request(app).post(`/users/${star.id}/follow`).set(auth(b)); // a request now
    await request(app).post(`/users/${star.id}/follow`).set(auth(c));
    expect(await stored(star.id)).toBe(1);
    expect((await request(app).post(`/follow-requests/${b.id}/approve`).set(auth(star))).status).toBe(200);
    expect(await stored(star.id)).toBe(2);
    await request(app).delete(`/follow-requests/${c.id}`).set(auth(star)); // refused: never counted
    expect(await stored(star.id)).toBe(2);
    await request(app).delete(`/users/${star.id}/follow`).set(auth(a));
    expect(await stored(star.id)).toBe(1);
    expect((await deleteAccount(b)).status).toBe(200);
    expect(await stored(star.id)).toBe(0);
  });

  it('popular suggestions for a new account: the most-followed public accounts first, never a private one', async () => {
    const newcomer = await registerAndLogin(app);
    const people = [];
    for (let i = 0; i < 6; i += 1) people.push(await registerAndLogin(app));
    const [bigU, midU, privU, f1, f2, f3] = people;
    for (const f of [f1, f2, f3]) await request(app).post(`/users/${bigU.id}/follow`).set(auth(f));
    for (const f of [f1, f2]) await request(app).post(`/users/${privU.id}/follow`).set(auth(f));
    await request(app).put('/profile/privacy').set(auth(privU)).send({ isPrivate: true });
    await request(app).post(`/users/${midU.id}/follow`).set(auth(f1));
    const res = await request(app).get('/users/suggestions').set(auth(newcomer));
    expect(res.status).toBe(200);
    const popular = res.body.filter((s) => s.reason === 'popular');
    expect(popular.slice(0, 2).map((s) => [s.id, s.follower_count])).toEqual([[bigU.id, 3], [midU.id, 1]]);
    expect(popular.map((s) => s.id)).not.toContain(privU.id);
  });

  it('deleting a busy group or page in one statement leaves every other count right', async () => {
    const owner = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const g1 = (await request(app).post('/communities').set(auth(owner)).send({ name: 'One' })).body;
    const g2 = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Two' })).body;
    await request(app).post(`/communities/${g1.id}/join`).set(auth(other));
    await request(app).post(`/communities/${g2.id}/join`).set(auth(other));
    expect((await request(app).delete(`/communities/${g1.id}`).set(auth(owner))).status).toBe(200);
    expect(await groupCount(g2.id, owner)).toBe(2);
    // Many rows at once (a bulk insert and delete): one statement each.
    await pool.query("INSERT INTO community_members (community_id, user_id, status) SELECT $1, id, 'pending' FROM users WHERE id NOT IN ($2, $3)", [g2.id, owner.id, other.id]);
    await pool.query("UPDATE community_members SET status = 'member' WHERE community_id = $1", [g2.id]);
    await pool.query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [g2.id, other.id]);
    expect(await groupCount(g2.id, owner)).toBe(await realMembers(g2.id));
  });
});
