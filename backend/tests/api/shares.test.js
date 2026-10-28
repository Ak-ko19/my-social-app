const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Days 93-94: share someone's post to your own feed (Facebook's Share).
// Only a post anyone may see can be shared, and a share shows its original
// only while that's still true -- sharing never widens an audience.
describe('sharing a post (Days 93-94)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const newPost = async (user, content = 'a post', fields = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return (await req).body;
  };
  const share = (user, post, body = {}) => request(app).post(`/posts/${post.id}/share`).set(auth(user)).send(body);
  const getPost = async (user, id) => (await request(app).get(`/posts/${id}`).set(user ? auth(user) : {})).body;
  const NOT_SHAREABLE = 'Only posts that everyone can see can be shared.';

  it('shares a public post with your own words; the share shows the original', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const original = await newPost(author, 'Sunset at Inle #travel');
    const res = await share(fan, original, { content: 'Look at this!' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ user_id: fan.id, content: 'Look at this!', is_share: true, shared_post_id: original.id, visibility: 'public' });
    const card = await getPost(fan, res.body.id);
    expect(card).toMatchObject({ is_share: true, can_share: true, share_count: 0 });
    expect(card.shared_post).toMatchObject({ id: original.id, content: 'Sunset at Inle #travel', user_id: author.id, username: author.username, media: [] });
    // The same moment as the original's own time (a real instant).
    expect(new Date(card.shared_post.created_at).getTime()).toBe(new Date((await getPost(author, original.id)).created_at).getTime());
    // The original counts it.
    expect((await getPost(author, original.id)).share_count).toBe(1);
    // Logged out readers see the same card.
    expect((await getPost(null, res.body.id)).shared_post.id).toBe(original.id);
  });

  it('"Share now": no words, and the audience you choose', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const one = await newPost(author, 'one');
    const two = await newPost(author, 'two');
    expect((await share(fan, one)).body).toMatchObject({ content: '', visibility: 'public' });
    // Two empty shares in a row aren't "the same post again" (spam checks on).
    process.env.SPAM_CHECKS_IN_TESTS = '1';
    try {
      expect((await share(fan, two, { visibility: 'followers' })).body).toMatchObject({ content: '', visibility: 'followers' });
    } finally {
      delete process.env.SPAM_CHECKS_IN_TESTS;
    }
    expect((await share(fan, one, { visibility: 'everyone' })).status).toBe(400);
    expect((await share(fan, one, { content: { a: 1 } })).status).toBe(400);
    expect((await share(fan, one, { content: 'x'.repeat(10001) })).status).toBe(400);
  });

  it('only posts that everyone can see can be shared', async () => {
    const author = await registerAndLogin(app);
    const follower = await registerAndLogin(app);
    await request(app).post(`/users/${author.id}/follow`).set(auth(follower));
    const forFollowers = await newPost(author, 'just for followers', { visibility: 'followers' });
    const onlyMe = await newPost(author, 'mine', { visibility: 'only_me' });
    // The follower can see it, but it isn't for everyone -- so no Share.
    expect((await getPost(follower, forFollowers.id)).can_share).toBe(false);
    const res = await share(follower, forFollowers);
    expect(res.status).toBe(403);
    expect(res.text).toBe(NOT_SHAREABLE);
    // Someone who can't see a post can't learn it exists.
    expect((await share(follower, onlyMe)).status).toBe(404);
    expect((await share(follower, { id: 999999 })).status).toBe(404);
    // A private account's posts: not for everyone either.
    await pool.query('UPDATE users SET is_private = true WHERE id = $1', [author.id]);
    const privatePublic = await newPost(author, 'private account');
    expect((await share(follower, privatePublic)).status).toBe(403);
    // You may share your own public post.
    await pool.query('UPDATE users SET is_private = false WHERE id = $1', [author.id]);
    expect((await share(author, await newPost(author, 'mine to share'))).status).toBe(201);
  });

  it('page posts and public group posts can be shared; private group posts cannot', async () => {
    const owner = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Tea Shop' })).body;
    const pagePost = await newPost(owner, 'new tea', { pageId: String(page.id) });
    const res = await share(fan, pagePost);
    expect(res.status).toBe(201);
    expect((await getPost(fan, res.body.id)).shared_post.page).toEqual({ id: page.id, name: 'Tea Shop', verified: false });

    const club = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Open club' })).body;
    const groupPost = await newPost(owner, 'hello club', { communityId: String(club.id) });
    expect((await share(fan, groupPost)).status).toBe(201);
    const closed = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Closed', privacy: 'private' })).body;
    const closedPost = await newPost(owner, 'members only', { communityId: String(closed.id) });
    expect((await share(owner, closedPost)).status).toBe(403);
  });

  it('sharing a share shares its original', async () => {
    const author = await registerAndLogin(app);
    const [a, b] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
    const original = await newPost(author, 'the source');
    const first = (await share(a, original, { content: 'via a' })).body;
    const second = (await share(b, first)).body;
    expect(second.shared_post_id).toBe(original.id);
    expect((await getPost(author, original.id)).share_count).toBe(2);
    expect((await getPost(a, first.id)).share_count).toBe(0);
  });

  it('when the original stops being for everyone, shares stop showing it', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const reader = await registerAndLogin(app);
    const original = await newPost(author, 'soon hidden');
    const shared = (await share(fan, original, { content: 'wow' })).body;
    const sharedPost = async (viewer) => (await getPost(viewer, shared.id)).shared_post;

    await request(app).put(`/posts/${original.id}`).set(auth(author)).send({ visibility: 'followers' });
    expect(await sharedPost(reader)).toBeNull();
    let card = await getPost(reader, shared.id);
    expect(card).toMatchObject({ is_share: true, shared_post: null, can_share: false, content: 'wow' });
    // Its author still sees their own post inside.
    expect((await sharedPost(author)).id).toBe(original.id);

    await request(app).put(`/posts/${original.id}`).set(auth(author)).send({ visibility: 'public' });
    expect((await sharedPost(reader)).id).toBe(original.id);

    // A block either way hides it from that reader only.
    await request(app).post(`/users/${author.id}/block`).set(auth(reader));
    expect(await sharedPost(reader)).toBeNull();
    expect((await sharedPost(null)).id).toBe(original.id);

    // A deactivated author: hidden from everyone.
    await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [author.id]);
    expect(await sharedPost(null)).toBeNull();
    await pool.query('UPDATE users SET is_deactivated = false WHERE id = $1', [author.id]);

    // Deleted: the share stays, and still knows it was one.
    expect((await request(app).delete(`/posts/${original.id}`).set(auth(author))).status).toBe(200);
    card = await getPost(fan, shared.id);
    expect(card).toMatchObject({ is_share: true, shared_post: null, can_share: false });
    expect((await share(reader, shared)).status).toBe(403);
  });

  it('every list carries the share card and counts', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await request(app).post(`/users/${fan.id}/follow`).set(auth(author));
    const original = await newPost(author, 'original');
    const shared = (await share(fan, original, { content: 'Shared #weekend' })).body;
    await request(app).post(`/posts/${shared.id}/like`).set(auth(author)); // Explore lists liked posts
    await request(app).post(`/posts/${shared.id}/bookmark`).set(auth(author));
    const lists = {
      feed: (await request(app).get('/feed').set(auth(author))).body.posts,
      posts: (await request(app).get('/posts').set(auth(author))).body.posts,
      profile: (await request(app).get(`/users/${fan.id}/posts`).set(auth(author))).body.posts,
      hashtag: (await request(app).get('/hashtags/weekend/posts').set(auth(author))).body.posts,
      explore: (await request(app).get('/explore/posts').set(auth(author))).body.posts,
      saved: (await request(app).get('/bookmarks').set(auth(author))).body.posts
    };
    for (const [name, list] of Object.entries(lists)) {
      const row = list.find((p) => p.id === shared.id);
      expect([name, row?.is_share, row?.shared_post?.id, row?.can_share]).toEqual([name, true, original.id, true]);
    }
    const originalRow = lists.feed.find((p) => p.id === original.id);
    expect(originalRow).toMatchObject({ is_share: false, shared_post: null, share_count: 1 });
  });

  it("notifies the original's author once per person, grouped per post; settings and restrict apply", async () => {
    const author = await registerAndLogin(app);
    const [a, b, c] = await Promise.all([registerAndLogin(app), registerAndLogin(app), registerAndLogin(app)]);
    const original = await newPost(author, 'share me');
    await share(a, original);
    await share(a, original, { content: 'again' });
    await share(b, original);
    let [row] = (await request(app).get('/notifications').set(auth(author))).body.notifications;
    expect(row).toMatchObject({ type: 'share', post_id: original.id, count: 2, actor_count: 2, actor_id: b.id });

    await request(app).put('/notification-preferences').set(auth(author)).send({ shares: false });
    await share(c, original);
    [row] = (await request(app).get('/notifications').set(auth(author))).body.notifications;
    expect(row.count).toBe(2);
    expect((await request(app).get('/notification-preferences').set(auth(author))).body.shares).toBe(false);

    // Sharing your own post notifies nobody.
    await request(app).put('/notification-preferences').set(auth(author)).send({ shares: true });
    await share(author, original);
    expect(Number((await pool.query("SELECT count(*) FROM notifications WHERE actor_id = $1 AND type = 'share'", [author.id])).rows[0].count)).toBe(0);
  });

  it("a share's words can be edited, even to nothing; the original it points at can't change", async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const original = await newPost(author, 'source');
    const other = await newPost(author, 'other');
    const shared = (await share(fan, original, { content: 'first words' })).body;
    const res = await request(app).put(`/posts/${shared.id}`).set(auth(fan)).send({ content: '', shared_post_id: other.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ content: '', shared_post_id: original.id });
    // An ordinary post still needs words.
    expect((await request(app).put(`/posts/${original.id}`).set(auth(author)).send({ content: ' ' })).status).toBe(400);
  });

  it('needs a login, and whole-number ids', async () => {
    const author = await registerAndLogin(app);
    const original = await newPost(author, 'x');
    expect((await request(app).post(`/posts/${original.id}/share`).send({})).status).toBe(401);
    expect((await request(app).post('/posts/1.5/share').set(auth(author)).send({})).status).toBe(400);
  });
});
