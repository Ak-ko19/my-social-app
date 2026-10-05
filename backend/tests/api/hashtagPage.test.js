const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 27: GET /hashtags/:tag/posts looks the tag up first and lists posts
// newest first by post id (so a popular tag reads only the rows it shows).
// Order, paging and tag matching must be what they always were.
describe('hashtag page (Day 27 query shape)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = async (user, content) => (await request(app).post('/posts').set(auth(user)).field('content', content)).body;
  const ids = (res) => res.body.posts.map((p) => p.id);

  it('lists the newest first and pages without gaps or repeats', async () => {
    const author = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    const first = await post(author, 'one #teashop');
    const second = await post(author, 'two #teashop');
    await post(author, 'not tagged');
    const third = await post(author, 'three #TeaShop');

    const page1 = await request(app).get('/hashtags/teashop/posts?limit=2').set(auth(viewer));
    expect(page1.status).toBe(200);
    expect(ids(page1)).toEqual([third.id, second.id]);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app).get('/hashtags/teashop/posts?limit=2&page=2').set(auth(viewer));
    expect(ids(page2)).toEqual([first.id]);
    expect(page2.body.hasMore).toBe(false);
  });

  it('matches the tag whatever its case, and only that tag', async () => {
    const author = await registerAndLogin(app);
    const tagged = await post(author, 'morning #Mohinga');
    await post(author, 'other #mohingashop');
    const res = await request(app).get('/hashtags/MOHINGA/posts');
    expect(ids(res)).toEqual([tagged.id]);
  });

  it('an unknown tag is an empty page, not an error', async () => {
    const res = await request(app).get('/hashtags/nosuchtag/posts');
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });
});
