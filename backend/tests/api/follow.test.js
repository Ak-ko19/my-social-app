const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('follow system (incl. private-account requests)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('follows a public account instantly (status accepted)', async () => {
    const follower = await registerAndLogin(app);
    const target = await registerAndLogin(app);

    const res = await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('accepted');

    // Read as the owner: a private account's lists are owner/follower-only.
      const followers = await request(app).get(`/users/${target.id}/connections?type=followers`).set('Authorization', `Bearer ${target.token}`);
    expect(followers.body.users.map((u) => u.id)).toContain(follower.id);
  });

  it('rejects following yourself', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app).post(`/users/${user.id}/follow`).set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate follow', async () => {
    const follower = await registerAndLogin(app);
    const target = await registerAndLogin(app);
    await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);
    const res = await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);
    expect(res.status).toBe(400);
  });

  it('unfollows successfully', async () => {
    const follower = await registerAndLogin(app);
    const target = await registerAndLogin(app);
    await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);
    const res = await request(app).delete(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);
    expect(res.status).toBe(200);
  });

  describe('private accounts', () => {
    async function makePrivate(user) {
      await request(app).put('/profile/privacy').set('Authorization', `Bearer ${user.token}`).send({ isPrivate: true });
    }

    it('a follow request to a private account lands as pending, not accepted', async () => {
      const follower = await registerAndLogin(app);
      const target = await registerAndLogin(app);
      await makePrivate(target);

      const res = await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');

      // Read as the owner: a private account's lists are owner/follower-only.
      const followers = await request(app).get(`/users/${target.id}/connections?type=followers`).set('Authorization', `Bearer ${target.token}`);
      expect(followers.body.users.map((u) => u.id)).not.toContain(follower.id);
    });

    it('the target can see and approve the pending request', async () => {
      const follower = await registerAndLogin(app);
      const target = await registerAndLogin(app);
      await makePrivate(target);
      await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);

      const requests = await request(app).get('/follow-requests').set('Authorization', `Bearer ${target.token}`);
      expect(requests.body.map((u) => u.id)).toContain(follower.id);

      const approve = await request(app)
        .post(`/follow-requests/${follower.id}/approve`)
        .set('Authorization', `Bearer ${target.token}`);
      expect(approve.status).toBe(200);

      // Read as the owner: a private account's lists are owner/follower-only.
      const followers = await request(app).get(`/users/${target.id}/connections?type=followers`).set('Authorization', `Bearer ${target.token}`);
      expect(followers.body.users.map((u) => u.id)).toContain(follower.id);
    });

    it('the target can deny the pending request', async () => {
      const follower = await registerAndLogin(app);
      const target = await registerAndLogin(app);
      await makePrivate(target);
      await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);

      const deny = await request(app)
        .delete(`/follow-requests/${follower.id}`)
        .set('Authorization', `Bearer ${target.token}`);
      expect(deny.status).toBe(200);

      const requests = await request(app).get('/follow-requests').set('Authorization', `Bearer ${target.token}`);
      expect(requests.body).toHaveLength(0);
    });

    it("unfollow also cancels a still-pending request", async () => {
      const follower = await registerAndLogin(app);
      const target = await registerAndLogin(app);
      await makePrivate(target);
      await request(app).post(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);

      const cancel = await request(app).delete(`/users/${target.id}/follow`).set('Authorization', `Bearer ${follower.token}`);
      expect(cancel.status).toBe(200);

      const requests = await request(app).get('/follow-requests').set('Authorization', `Bearer ${target.token}`);
      expect(requests.body).toHaveLength(0);
    });
  });

  it('a blocked user cannot follow the blocker', async () => {
    const blocker = await registerAndLogin(app);
    const blocked = await registerAndLogin(app);
    await request(app).post(`/users/${blocked.id}/block`).set('Authorization', `Bearer ${blocker.token}`);

    const res = await request(app).post(`/users/${blocker.id}/follow`).set('Authorization', `Bearer ${blocked.token}`);
    expect(res.status).toBe(403);
  });
});
