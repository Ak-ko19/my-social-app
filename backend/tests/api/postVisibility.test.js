const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B5: per-post audience (migration 020). A 'followers' post on a PUBLIC
// account must be hidden from non-followers everywhere a post can surface.
describe('post visibility: Public / Followers only (B5)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  let author;
  let follower;
  let stranger;
  let tag;
  let hidden;
  let open;

  beforeEach(async () => {
    author = await registerAndLogin(app);
    follower = await registerAndLogin(app);
    stranger = await registerAndLogin(app);
    await request(app).post(`/users/${author.id}/follow`).set(auth(follower));
    tag = `b5tag${Date.now()}`;
    hidden = (await request(app).post('/posts').set(auth(author)).field('content', `secret #${tag}`).field('visibility', 'followers')).body;
    open = (await request(app).post('/posts').set(auth(author)).field('content', `hello #${tag}`)).body;
  });

  it('stores visibility (default public) and exposes it on payloads', async () => {
    expect(hidden.visibility).toBe('followers');
    expect(open.visibility).toBe('public');
    const detail = await request(app).get(`/posts/${hidden.id}`).set(auth(author));
    expect(detail.body.visibility).toBe('followers');
  });

  it('rejects an unknown visibility (400)', async () => {
    const res = await request(app).post('/posts').set(auth(author)).field('content', 'x').field('visibility', 'friends');
    expect(res.status).toBe(400);
  });

  it('discovery feed (GET /posts): hidden from strangers and anonymous, shown to followers + author', async () => {
    const ids = async (user) => (await request(app).get('/posts').set(user ? auth(user) : {})).body.posts.map((p) => p.id);
    expect(await ids(stranger)).not.toContain(hidden.id);
    expect(await ids(stranger)).toContain(open.id);
    expect(await ids(null)).not.toContain(hidden.id);
    expect(await ids(follower)).toContain(hidden.id);
    expect(await ids(author)).toContain(hidden.id);
  });

  it('post detail 404s for a stranger, 200 for a follower', async () => {
    expect((await request(app).get(`/posts/${hidden.id}`).set(auth(stranger))).status).toBe(404);
    expect((await request(app).get(`/posts/${hidden.id}`)).status).toBe(404);
    expect((await request(app).get(`/posts/${hidden.id}`).set(auth(follower))).status).toBe(200);
  });

  it('home feed (GET /feed) shows it to followers', async () => {
    const feed = await request(app).get('/feed').set(auth(follower));
    expect(feed.body.posts.map((p) => p.id)).toContain(hidden.id);
  });

  it('hashtag feed and search hide it from strangers', async () => {
    const tagged = await request(app).get(`/hashtags/${tag}/posts`).set(auth(stranger));
    expect(tagged.body.posts.map((p) => p.id)).toEqual([open.id]);
    const search = await request(app).get('/search/posts').query({ q: 'secret' }).set(auth(stranger));
    expect(search.body.posts.map((p) => p.id)).not.toContain(hidden.id);
    const searchFollower = await request(app).get('/search/posts').query({ q: 'secret' }).set(auth(follower));
    expect(searchFollower.body.posts.map((p) => p.id)).toContain(hidden.id);
  });

  it('strangers cannot like, react, comment, bookmark, or read comments (404)', async () => {
    expect((await request(app).post(`/posts/${hidden.id}/like`).set(auth(stranger))).status).toBe(404);
    expect((await request(app).put(`/posts/${hidden.id}/reaction`).set(auth(stranger)).send({ reaction: 'love' })).status).toBe(404);
    expect((await request(app).post(`/posts/${hidden.id}/comments`).set(auth(stranger)).send({ content: 'x' })).status).toBe(404);
    expect((await request(app).post(`/posts/${hidden.id}/bookmark`).set(auth(stranger))).status).toBe(404);
    expect((await request(app).get(`/posts/${hidden.id}/comments`).set(auth(stranger))).status).toBe(404);
  });

  it('a bookmark made while it was public disappears once the author restricts it', async () => {
    await request(app).post(`/posts/${open.id}/bookmark`).set(auth(stranger));
    await request(app).put(`/posts/${open.id}`).set(auth(author)).send({ visibility: 'followers' });
    const saved = await request(app).get('/bookmarks').set(auth(stranger));
    expect(saved.body.posts.map((p) => p.id)).not.toContain(open.id);
  });

  it('the author can change only the audience, and back', async () => {
    const res = await request(app).put(`/posts/${hidden.id}`).set(auth(author)).send({ visibility: 'public' });
    expect(res.status).toBe(200);
    expect(res.body.visibility).toBe('public');
    expect(res.body.content).toBe(`secret #${tag}`); // content untouched
    expect((await request(app).get(`/posts/${hidden.id}`).set(auth(stranger))).status).toBe(200);
  });

  it('update validation: empty content 400 (was a 500), empty body 400, bad visibility 400', async () => {
    expect((await request(app).put(`/posts/${open.id}`).set(auth(author)).send({ content: '   ' })).status).toBe(400);
    expect((await request(app).put(`/posts/${open.id}`).set(auth(author)).send({})).status).toBe(400);
    expect((await request(app).put(`/posts/${open.id}`).set(auth(author)).send({ visibility: 'nobody' })).status).toBe(400);
    expect((await request(app).put(`/posts/${open.id}`).set(auth(stranger)).send({ visibility: 'followers' })).status).toBe(403);
  });

  it('a private account stays followers-only even for a "public" post', async () => {
    await request(app).put('/profile/privacy').set(auth(author)).send({ isPrivate: true });
    expect((await request(app).get(`/posts/${open.id}`).set(auth(stranger))).status).toBe(404);
  });
});
