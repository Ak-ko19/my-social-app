const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 36: one post pinned to the top of a profile.
describe('pinned post (Day 36)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = async (user, content, visibility) => {
    const req = request(app).post('/posts').set(auth(user)).field('content', content);
    if (visibility) req.field('visibility', visibility);
    return (await req).body;
  };
  const pin = (user, postId) => request(app).put('/profile/pinned-post').set(auth(user)).send({ postId });
  const tab = async (viewer, ownerId, page = 1, limit = 12) => {
    const req = request(app).get(`/users/${ownerId}/posts?tab=posts&page=${page}&limit=${limit}`);
    if (viewer) req.set(auth(viewer));
    return (await req).body;
  };

  it('pins your own post: it comes first (as pinned) and only once', async () => {
    const me = await registerAndLogin(app);
    const old = await post(me, 'old one');
    const newer = await post(me, 'newer one');
    expect((await pin(me, old.id)).body).toEqual({ pinned_post_id: old.id });
    const viewer = await registerAndLogin(app);
    const body = await tab(viewer, me.id);
    expect(body.pinned).toMatchObject({ id: old.id, is_pinned: true, content: 'old one' });
    expect(body.posts.map((p) => p.id)).toEqual([newer.id]);
  });

  it('later pages don\'t repeat it and paging stays exact', async () => {
    const me = await registerAndLogin(app);
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push((await post(me, `p${i}`)).id);
    await pin(me, ids[2]);
    const p1 = await tab(null, me.id, 1, 2);
    const p2 = await tab(null, me.id, 2, 2);
    expect(p1.pinned.id).toBe(ids[2]);
    expect(p2.pinned).toBeNull();
    expect([...p1.posts, ...p2.posts].map((p) => p.id)).toEqual([ids[4], ids[3], ids[1], ids[0]]);
  });

  it('pinning another replaces it; unpinning clears it', async () => {
    const me = await registerAndLogin(app);
    const a = await post(me, 'a');
    const b = await post(me, 'b');
    await pin(me, a.id);
    await pin(me, b.id);
    expect((await tab(me, me.id)).pinned.id).toBe(b.id);
    expect((await request(app).delete('/profile/pinned-post').set(auth(me))).body).toEqual({ pinned_post_id: null });
    const after = await tab(me, me.id);
    expect(after.pinned).toBeNull();
    expect(after.posts.map((p) => p.id)).toEqual([b.id, a.id]);
  });

  it('only your own post that is on your profile (not someone else\'s, a group\'s or a page\'s)', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const theirs = await post(other, 'not mine');
    expect((await pin(me, theirs.id)).status).toBe(404);
    expect((await pin(me, 999999)).status).toBe(404);
    expect((await pin(me, 'x')).status).toBe(400);
    const group = (await request(app).post('/communities').set(auth(me)).send({ name: 'Club', privacy: 'public' })).body;
    const inGroup = (await request(app).post('/posts').set(auth(me)).field('content', 'group post').field('communityId', String(group.id))).body;
    expect((await pin(me, inGroup.id)).status).toBe(404);
    expect((await request(app).put('/profile/pinned-post').send({ postId: 1 })).status).toBe(401);
  });

  it('visibility still applies: an "Only me" pin shows only to its author', async () => {
    const me = await registerAndLogin(app);
    const secret = await post(me, 'just for me', 'only_me');
    await pin(me, secret.id);
    expect((await tab(me, me.id)).pinned.id).toBe(secret.id);
    const viewer = await registerAndLogin(app);
    const seen = await tab(viewer, me.id);
    expect(seen.pinned).toBeNull();
    expect(JSON.stringify(seen)).not.toContain('just for me');
  });

  it('deleting the pinned post unpins it', async () => {
    const me = await registerAndLogin(app);
    const p = await post(me, 'soon gone');
    await pin(me, p.id);
    await request(app).delete(`/posts/${p.id}`).set(auth(me));
    expect((await tab(me, me.id)).pinned).toBeNull();
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(me))).text);
    expect(data.profile.pinned_post_id).toBeNull();
  });

  it('only the posts tab has a pinned post', async () => {
    const me = await registerAndLogin(app);
    const p = await post(me, 'hello @nobody');
    await pin(me, p.id);
    const photos = (await request(app).get(`/users/${me.id}/posts?tab=photos`)).body;
    expect(photos.pinned ?? null).toBeNull();
  });
});
