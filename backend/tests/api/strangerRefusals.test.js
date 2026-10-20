const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 75 (security round 2): the routes that change something by id and had
// no test with someone who may not do it (found by recording every status
// the API tests produced). Each was already guarded; these pin it. Routes
// that only ever touch the caller's own rows (un-like, unfollow, un-mute...)
// have nobody else's data to protect and aren't listed.
describe('changes by id refuse people who may not make them', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  let owner;
  let member;
  let stranger;
  beforeEach(async () => {
    [owner, member, stranger] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
  });

  it("a group member can't change roles or approve join requests; only admins can", async () => {
    const g = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Closed', privacy: 'private' })).body;
    await request(app).post(`/communities/${g.id}/join`).set(auth(member));
    expect((await request(app).post(`/communities/${g.id}/requests/${member.id}/approve`).set(auth(owner))).status).toBe(200);
    await request(app).post(`/communities/${g.id}/join`).set(auth(stranger)); // pending

    const approve = await request(app).post(`/communities/${g.id}/requests/${stranger.id}/approve`).set(auth(member));
    expect(approve.status).toBe(403);
    const promote = await request(app).put(`/communities/${g.id}/members/${member.id}/role`).set(auth(member)).send({ role: 'admin' });
    expect(promote.status).toBe(403);
    const byOutsider = await request(app).put(`/communities/${g.id}/members/${member.id}/role`).set(auth(stranger)).send({ role: 'admin' });
    expect(byOutsider.status).toBe(403);
    const rows = (await pool.query('SELECT user_id, role, status FROM community_members WHERE community_id = $1 ORDER BY user_id', [g.id])).rows;
    expect(rows).toEqual([
      { user_id: owner.id, role: 'admin', status: 'member' },
      { user_id: member.id, role: 'member', status: 'member' },
      { user_id: stranger.id, role: 'member', status: 'pending' }
    ]);
  });

  it("can't answer an event they may not see", async () => {
    const event = (await request(app).post('/events').set(auth(owner))
      .send({ name: 'Followers only', startsAt: new Date(Date.now() + 48 * 3600e3).toISOString(), audience: 'followers' })).body;
    const res = await request(app).put(`/events/${event.id}/response`).set(auth(stranger)).send({ status: 'going' });
    expect(res.status).toBe(404);
    expect((await pool.query('SELECT count(*)::int AS n FROM event_responses WHERE event_id = $1', [event.id])).rows[0].n).toBe(0);
  });

  it("someone outside a chat can't mark it read or touch its reactions", async () => {
    const conv = (await request(app).post('/conversations').set(auth(owner)).send({ userId: member.id })).body;
    const msg = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(owner)).send({ content: 'hi' })).body;
    await request(app).put(`/conversations/${conv.id}/messages/${msg.id}/reaction`).set(auth(member)).send({ reaction: 'love' });

    expect((await request(app).put(`/conversations/${conv.id}/read`).set(auth(stranger))).status).toBe(403);
    const unreact = await request(app).delete(`/conversations/${conv.id}/messages/${msg.id}/reaction`).set(auth(stranger));
    expect([403, 404]).toContain(unreact.status);
    expect((await pool.query('SELECT count(*)::int AS n FROM message_reactions WHERE message_id = $1', [msg.id])).rows[0].n).toBe(1);
  });

  it("approving a follow request nobody sent doesn't make anyone follow you", async () => {
    const res = await request(app).post(`/follow-requests/${stranger.id}/approve`).set(auth(owner));
    expect(res.status).toBe(404);
    expect((await pool.query('SELECT count(*)::int AS n FROM follows WHERE follower_id = $1', [stranger.id])).rows[0].n).toBe(0);
  });
});
