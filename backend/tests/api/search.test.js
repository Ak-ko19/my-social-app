const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('search', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('finds a user by a partial, case-insensitive username match', async () => {
    const user = await registerAndLogin(app, { username: `findme_${Date.now()}` });
    const res = await request(app).get(`/search/users?q=${user.username.slice(0, 6).toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.map((u) => u.id)).toContain(user.id);
  });

  it('requires a query string', async () => {
    const res = await request(app).get('/search/users');
    expect(res.status).toBe(400);
  });

  it('excludes a user blocked by the viewer from results', async () => {
    const target = await registerAndLogin(app, { username: `blockedsearch_${Date.now()}` });
    const viewer = await registerAndLogin(app);
    await request(app).post(`/users/${target.id}/block`).set('Authorization', `Bearer ${viewer.token}`);

    const res = await request(app)
      .get(`/search/users?q=${target.username.slice(0, 6)}`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(res.body.map((u) => u.id)).not.toContain(target.id);
  });

  it('finds a post by content', async () => {
    const author = await registerAndLogin(app);
    const unique = `findablecontent${Date.now()}`;
    await request(app).post('/posts').set('Authorization', `Bearer ${author.token}`).field('content', `a post with ${unique} in it`);

    const res = await request(app).get(`/search/posts?q=${unique}`);
    expect(res.status).toBe(200);
    expect(res.body.posts.some((p) => p.content.includes(unique))).toBe(true);
  });

  it("does not return a private author's post to a non-follower", async () => {
    const author = await registerAndLogin(app);
    const unique = `privatesearch${Date.now()}`;
    await request(app).post('/posts').set('Authorization', `Bearer ${author.token}`).field('content', `${unique} secret`);
    await request(app).put('/profile/privacy').set('Authorization', `Bearer ${author.token}`).send({ isPrivate: true });

    const res = await request(app).get(`/search/posts?q=${unique}`);
    expect(res.body.posts.some((p) => p.content.includes(unique))).toBe(false);
  });
});
