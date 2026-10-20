const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 75: query values are always single strings (server.js 'query parser').
describe('query string values', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

  it('a repeated key keeps its first value (search used to answer 500)', async () => {
    const me = await registerAndLogin(app);
    await request(app).post('/posts').set(auth(me)).field('content', 'sunset over the river');
    for (const path of ['/search/posts', '/search/users', '/search/hashtags']) {
      const res = await request(app).get(`${path}?q=sunset&q=other`).set(auth(me));
      expect([path, res.status]).toEqual([path, 200]);
    }
    const posts = await request(app).get('/search/posts?q=sunset&q=nothing-matches').set(auth(me));
    expect(posts.body.posts.map((p) => p.content)).toEqual(['sunset over the river']);
  });

  it("decodes like a browser sends it ('+', %-escapes, Arabic and Burmese) and ignores __proto__", async () => {
    const me = await registerAndLogin(app);
    await request(app).post('/posts').set(auth(me)).field('content', 'مرحبا بالعالم မင်္ဂလာပါ');
    const arabic = await request(app).get(`/search/posts?q=${encodeURIComponent('مرحبا')}`).set(auth(me));
    expect(arabic.body.posts).toHaveLength(1);
    const spaced = await request(app).get('/search/posts?q=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7+%D8%A8%D8%A7%D9%84%D8%B9%D8%A7%D9%84%D9%85').set(auth(me));
    expect(spaced.body.posts).toHaveLength(1);
    const burmese = await request(app).get(`/search/posts?q=${encodeURIComponent('မင်္ဂလာ')}`).set(auth(me));
    expect(burmese.body.posts).toHaveLength(1);
    const proto = await request(app).get('/search/posts?__proto__=x&q=zzz').set(auth(me));
    expect(proto.status).toBe(200);
  });
});
