const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('block', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('blocks a user', async () => {
    const blocker = await registerAndLogin(app);
    const target = await registerAndLogin(app);
    const res = await request(app).post(`/users/${target.id}/block`).set('Authorization', `Bearer ${blocker.token}`);
    expect(res.status).toBe(201);

    const list = await request(app).get('/blocked-users').set('Authorization', `Bearer ${blocker.token}`);
    expect(list.body.blockedUsers.map((u) => u.id)).toContain(target.id);
  });

  it('rejects blocking yourself', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app).post(`/users/${user.id}/block`).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate block', async () => {
    const blocker = await registerAndLogin(app);
    const target = await registerAndLogin(app);
    await request(app).post(`/users/${target.id}/block`).set('Authorization', `Bearer ${blocker.token}`);
    const res = await request(app).post(`/users/${target.id}/block`).set('Authorization', `Bearer ${blocker.token}`);
    expect(res.status).toBe(400);
  });

  it('blocking severs an existing follow relationship in both directions', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    await request(app).post(`/users/${b.id}/follow`).set('Authorization', `Bearer ${a.token}`);
    await request(app).post(`/users/${a.id}/follow`).set('Authorization', `Bearer ${b.token}`);

    await request(app).post(`/users/${b.id}/block`).set('Authorization', `Bearer ${a.token}`);

    const aFollowingB = await request(app).get(`/users/${a.id}/connections?type=following`);
    const bFollowingA = await request(app).get(`/users/${b.id}/connections?type=following`);
    expect(aFollowingB.body.users.map((u) => u.id)).not.toContain(b.id);
    expect(bFollowingA.body.users.map((u) => u.id)).not.toContain(a.id);
  });

  it('unblocks a user', async () => {
    const blocker = await registerAndLogin(app);
    const target = await registerAndLogin(app);
    await request(app).post(`/users/${target.id}/block`).set('Authorization', `Bearer ${blocker.token}`);
    const res = await request(app).delete(`/users/${target.id}/block`).set('Authorization', `Bearer ${blocker.token}`);
    expect(res.status).toBe(200);

    const list = await request(app).get('/blocked-users').set('Authorization', `Bearer ${blocker.token}`);
    expect(list.body.blockedUsers.map((u) => u.id)).not.toContain(target.id);
  });

  it('404s unblocking someone never blocked', async () => {
    const blocker = await registerAndLogin(app);
    const target = await registerAndLogin(app);
    const res = await request(app).delete(`/users/${target.id}/block`).set('Authorization', `Bearer ${blocker.token}`);
    expect(res.status).toBe(404);
  });
});
