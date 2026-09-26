const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B6 profile tabs: GET /users/:id/posts?tab=posts|photos|tagged.
describe('profile tabs (B6)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const post = (user, content, { image = false, visibility } = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    if (visibility) req = req.field('visibility', visibility);
    if (image) req = req.attach('images', png, { filename: 'p.png', contentType: 'image/png' });
    return req.then((r) => r.body);
  };
  const tab = (target, name, viewer) =>
    request(app).get(`/users/${target.id}/posts`).query({ tab: name }).set(viewer ? auth(viewer) : {});
  const contents = (res) => res.body.posts.map((p) => p.content);

  it('posts tab: the user\'s own posts, newest first; photos tab: only posts with images', async () => {
    const me = await registerAndLogin(app);
    await post(me, 'text one');
    await post(me, 'with pic', { image: true });
    await post(me, 'text two');

    expect(contents(await tab(me, 'posts', me))).toEqual(['text two', 'with pic', 'text one']);
    const photos = await tab(me, 'photos', me);
    expect(contents(photos)).toEqual(['with pic']);
    expect(photos.body.posts[0].media).toHaveLength(1);
  });

  it('tagged tab: other people\'s posts that @mention the user (word boundaries respected)', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    await post(friend, `great work @${me.username}!`);
    await post(friend, `ping @${me.username}x not me`); // longer username -> not a mention
    await post(friend, 'no mention here');
    await post(me, `talking about myself @${me.username}`); // own post excluded

    expect(contents(await tab(me, 'tagged', friend))).toEqual([`great work @${me.username}!`]);
  });

  it('tagged mentions match case-insensitively', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    await post(friend, `hey @${me.username.toUpperCase()}`);
    expect((await tab(me, 'tagged', friend)).body.posts).toHaveLength(1);
  });

  it('respects per-post audience: a followers-only post is hidden from a stranger', async () => {
    const me = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    await post(me, 'public one');
    await post(me, 'followers one', { visibility: 'followers' });
    expect(contents(await tab(me, 'posts', stranger))).toEqual(['public one']);
    expect(contents(await tab(me, 'posts', me))).toEqual(['followers one', 'public one']);
  });

  it('a private account\'s tabs are 403 to non-followers and anonymous; open to accepted followers', async () => {
    const priv = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await post(priv, 'private post');
    await request(app).put('/profile/privacy').set(auth(priv)).send({ isPrivate: true });
    await request(app).post(`/users/${priv.id}/follow`).set(auth(fan));
    await request(app).post(`/follow-requests/${fan.id}/approve`).set(auth(priv));

    expect((await tab(priv, 'posts', outsider)).status).toBe(403);
    expect((await tab(priv, 'tagged')).status).toBe(403);
    expect(contents(await tab(priv, 'posts', fan))).toEqual(['private post']);
    expect(contents(await tab(priv, 'posts', priv))).toEqual(['private post']);
  });

  it('blocked (either direction) -> 404; unknown user -> 404; bad tab -> 400', async () => {
    const me = await registerAndLogin(app);
    const blocker = await registerAndLogin(app);
    await request(app).post(`/users/${me.id}/block`).set(auth(blocker));
    expect((await tab(blocker, 'posts', me)).status).toBe(404);
    expect((await request(app).get('/users/999999/posts')).status).toBe(404);
    expect((await request(app).get(`/users/${me.id}/posts`).query({ tab: 'likes' })).status).toBe(400);
  });

  it('paginates with hasMore', async () => {
    const me = await registerAndLogin(app);
    for (let i = 0; i < 3; i++) await post(me, `p${i}`);
    const first = await request(app).get(`/users/${me.id}/posts`).query({ tab: 'posts', limit: 2, page: 1 });
    expect(first.body.posts).toHaveLength(2);
    expect(first.body.hasMore).toBe(true);
    const second = await request(app).get(`/users/${me.id}/posts`).query({ tab: 'posts', limit: 2, page: 2 });
    expect(contents(second)).toEqual(['p0']);
    expect(second.body.hasMore).toBe(false);
  });
});
