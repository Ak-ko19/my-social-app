const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 85: every post card says how many comments it has before they are
// opened -- the same comments the list would show that viewer.
describe('comment counts on post cards (Day 85)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const comment = (user, post, content, parentId) =>
    request(app).post(`/posts/${post.id}/comments`).set(auth(user)).send({ content, ...(parentId ? { parentCommentId: parentId } : {}) });
  const countIn = (list, post) => list.find((p) => p.id === post.id)?.comment_count;

  it('in every list, and on the post itself; replies count too', async () => {
    const author = await registerAndLogin(app);
    const reader = await registerAndLogin(app);
    await request(app).post(`/users/${author.id}/follow`).set(auth(reader));
    const post = (await request(app).post('/posts').set(auth(author)).field('content', 'Trip #weekend')).body;
    const top = (await comment(reader, post, 'nice')).body;
    await comment(author, post, 'thanks', top.id);
    await comment(reader, post, 'more');
    await request(app).post(`/posts/${post.id}/like`).set(auth(reader)); // Explore lists liked posts
    await request(app).post(`/posts/${post.id}/bookmark`).set(auth(reader));
    const lists = {
      feed: (await request(app).get('/feed').set(auth(reader))).body.posts,
      posts: (await request(app).get('/posts').set(auth(reader))).body.posts,
      profile: (await request(app).get(`/users/${author.id}/posts`).set(auth(reader))).body.posts,
      hashtag: (await request(app).get('/hashtags/weekend/posts').set(auth(reader))).body.posts,
      explore: (await request(app).get('/explore/posts').set(auth(reader))).body.posts,
      saved: (await request(app).get('/bookmarks').set(auth(reader))).body.posts
    };
    for (const [name, list] of Object.entries(lists)) expect([name, countIn(list, post)]).toEqual([name, 3]);
    expect((await request(app).get(`/posts/${post.id}`).set(auth(reader))).body.comment_count).toBe(3);
    // Logged out too.
    expect((await request(app).get(`/posts/${post.id}`)).body.comment_count).toBe(3);
  });

  it('in groups and on pages', async () => {
    const owner = await registerAndLogin(app);
    const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Club' })).body;
    const inGroup = (await request(app).post('/posts').set(auth(owner)).field('content', 'hi club').field('communityId', String(group.id))).body;
    await comment(owner, inGroup, 'first');
    const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Shop' })).body;
    const onPage = (await request(app).post('/posts').set(auth(owner)).field('content', 'sale').field('pageId', String(page.id))).body;
    await comment(owner, onPage, 'a');
    await comment(owner, onPage, 'b');
    expect(countIn((await request(app).get(`/communities/${group.id}/posts`).set(auth(owner))).body.posts, inGroup)).toBe(1);
    expect(countIn((await request(app).get(`/pages/${page.id}/posts`).set(auth(owner))).body.posts, onPage)).toBe(2);
  });

  it('what you would not see is not counted: across a block, or waiting for approval', async () => {
    const author = await registerAndLogin(app);
    const reader = await registerAndLogin(app);
    const rude = await registerAndLogin(app);
    const post = (await request(app).post('/posts').set(auth(author)).field('content', 'hello')).body;
    await comment(reader, post, 'fine');
    await comment(rude, post, 'held back');
    await pool.query('UPDATE comments SET awaiting_approval = true WHERE user_id = $1', [rude.id]);
    const count = async (viewer) => (await request(app).get(`/posts/${post.id}`).set(auth(viewer))).body.comment_count;
    expect(await count(reader)).toBe(1); // the held one is not theirs
    expect(await count(author)).toBe(2); // the owner sees it, to approve
    expect(await count(rude)).toBe(2); // and so does its writer
    await request(app).post(`/users/${reader.id}/block`).set(auth(author));
    expect(await count(author)).toBe(1);
  });
});
