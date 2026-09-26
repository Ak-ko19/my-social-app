const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B3 Stories (migration 018). Cloudinary is mocked in setupTestApp.
describe('stories (B3)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const postStory = (user) =>
    request(app).post('/stories').set(auth(user)).attach('image', png, { filename: 's.png', contentType: 'image/png' });
  const follow = (follower, target) => request(app).post(`/users/${target.id}/follow`).set(auth(follower));
  const tray = (user) => request(app).get('/stories').set(auth(user));

  it('posts a story that expires ~24h later', async () => {
    const me = await registerAndLogin(app);
    const res = await postStory(me);
    expect(res.status).toBe(201);
    expect(res.body.media_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    const hours = (new Date(res.body.expires_at) - new Date(res.body.created_at)) / 3600000;
    expect(hours).toBeCloseTo(24, 1);
  });

  it('requires an image (400) and auth (401)', async () => {
    const me = await registerAndLogin(app);
    expect((await request(app).post('/stories').set(auth(me))).status).toBe(400);
    expect((await request(app).get('/stories')).status).toBe(401);
  });

  it('tray: own group first, then followed accounts; non-followed accounts never appear', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    await follow(me, friend);
    await postStory(friend);
    await postStory(stranger);
    await postStory(me);

    const res = await tray(me);
    expect(res.status).toBe(200);
    expect(res.body.map((g) => g.user_id)).toEqual([me.id, friend.id]);
    expect(res.body[0].is_own).toBe(true);
    expect(res.body[1].stories).toHaveLength(1);
  });

  it('a pending (unapproved) follow of a private account does not show its stories', async () => {
    const me = await registerAndLogin(app);
    const priv = await registerAndLogin(app);
    await request(app).put('/profile/privacy').set(auth(priv)).send({ isPrivate: true });
    await follow(me, priv); // pending
    await postStory(priv);
    expect((await tray(me)).body).toHaveLength(0);
  });

  it('a block (either direction) hides stories even from a follower', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    await follow(me, friend);
    await postStory(friend);
    await request(app).post(`/users/${me.id}/block`).set(auth(friend));
    expect((await tray(me)).body).toHaveLength(0);
  });

  it('expired stories disappear from the tray and cannot be viewed', async () => {
    const { pool } = require('../helpers/testDb');
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    await follow(me, friend);
    const story = (await postStory(friend)).body;
    await pool.query("UPDATE stories SET expires_at = now() - INTERVAL '1 minute' WHERE id = $1", [story.id]);

    expect((await tray(me)).body).toHaveLength(0);
    expect((await request(app).post(`/stories/${story.id}/view`).set(auth(me))).status).toBe(404);
  });

  it('viewing marks a story seen; groups with unseen stories sort before fully-seen ones', async () => {
    const me = await registerAndLogin(app);
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    await follow(me, a);
    await follow(me, b);
    const aStory = (await postStory(a)).body;
    await postStory(b); // b's story is newer

    // Before viewing: both unseen, newest (b) first.
    let res = await tray(me);
    expect(res.body.map((g) => g.user_id)).toEqual([b.id, a.id]);

    // After seeing b's only story, a (still unseen) moves ahead of b.
    const bStoryId = res.body[0].stories[0].id;
    expect((await request(app).post(`/stories/${bStoryId}/view`).set(auth(me))).status).toBe(204);
    // Idempotent.
    expect((await request(app).post(`/stories/${bStoryId}/view`).set(auth(me))).status).toBe(204);
    res = await tray(me);
    expect(res.body.map((g) => g.user_id)).toEqual([a.id, b.id]);
    expect(res.body[1].all_seen).toBe(true);
    expect(res.body[1].stories[0].seen).toBe(true);
    expect(res.body[0].stories[0].id).toBe(aStory.id);
  });

  it('cannot mark a story from a non-followed account as viewed (404)', async () => {
    const me = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    const story = (await postStory(stranger)).body;
    expect((await request(app).post(`/stories/${story.id}/view`).set(auth(me))).status).toBe(404);
  });

  it('only the author can delete a story', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    await follow(friend, me);
    const story = (await postStory(me)).body;

    expect((await request(app).delete(`/stories/${story.id}`).set(auth(friend))).status).toBe(403);
    expect((await request(app).delete(`/stories/${story.id}`).set(auth(me))).status).toBe(200);
    expect((await tray(friend)).body).toHaveLength(0);
    expect((await request(app).delete(`/stories/${story.id}`).set(auth(me))).status).toBe(404);
  });
});
