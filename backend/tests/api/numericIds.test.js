const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 85: ids come back as numbers everywhere (two answers echoed the text
// of the URL), and a part of an id is refused, not a server error.
describe('ids in answers (Day 85)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  it("follow counts and a post's reactions give the id as a number", async () => {
    const me = await registerAndLogin(app);
    const post = (await request(app).post('/posts').set(auth(me)).field('content', 'hello')).body;
    expect((await request(app).get(`/users/${me.id}/follow-counts`)).body.userId).toBe(me.id);
    expect((await request(app).get(`/posts/${post.id}/likes`).set(auth(me))).body.postId).toBe(post.id);
  });

  it('half an id is a 400', async () => {
    const me = await registerAndLogin(app);
    expect((await request(app).get('/users/1.5/follow-counts')).status).toBe(400);
    expect((await request(app).get('/users/0/follow-counts')).status).toBe(400);
    expect((await request(app).get('/posts/1.5/likes').set(auth(me))).status).toBeLessThan(500);
  });
});
