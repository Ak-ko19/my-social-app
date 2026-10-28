const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
// The limit (services/hashtagService MAX_FOLLOWS) -- not required from there:
// that would open the database pool before the test setup chose the database.
const MAX_FOLLOWS = 200;

// Days 107-108: following a hashtag.
describe('following hashtags (Days 107-108)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const followTag = (user, tag) => request(app).put(`/hashtags/${encodeURIComponent(tag)}/follow`).set(auth(user));
  const unfollowTag = (user, tag) => request(app).delete(`/hashtags/${encodeURIComponent(tag)}/follow`).set(auth(user));
  const info = (user, tag) => (user ? request(app).get(`/hashtags/${encodeURIComponent(tag)}`).set(auth(user)) : request(app).get(`/hashtags/${encodeURIComponent(tag)}`));
  const mine = async (user) => (await request(app).get('/followed-hashtags').set(auth(user))).body;

  let ann;
  let ben;
  beforeEach(async () => {
    ann = await registerAndLogin(app);
    ben = await registerAndLogin(app);
  });

  it('follow and unfollow by any spelling (with #, any case, any language); both idempotent; the list is newest first', async () => {
    await request(app).post('/posts').set(auth(ben)).field('content', 'Morning #Tea');
    expect((await info(ann, 'tea')).body).toEqual({ tag: 'tea', is_following: false });
    expect((await info(null, 'tea')).body).toEqual({ tag: 'tea', is_following: false });

    expect((await followTag(ann, '#TEA')).body).toEqual({ tag: 'tea', is_following: true });
    expect((await followTag(ann, 'tea')).status).toBe(200);
    expect((await info(ann, 'Tea')).body.is_following).toBe(true);
    expect((await info(ben, 'tea')).body.is_following).toBe(false);

    // A tag nobody has used yet can be followed; Burmese and Arabic too.
    expect((await followTag(ann, 'ရန်ကုန်')).body.tag).toBe('ရန်ကုန်');
    expect((await followTag(ann, 'قهوة')).status).toBe(200);
    const list = await mine(ann);
    expect(list.max).toBe(MAX_FOLLOWS);
    expect(list.hashtags.map((h) => h.tag)).toEqual(['قهوة', 'ရန်ကုန်', 'tea']);
    expect((await pool.query("SELECT count(*)::int AS n FROM hashtags WHERE tag = 'ရန်ကုန်'")).rows[0].n).toBe(1);

    expect((await unfollowTag(ann, 'Tea')).body).toEqual({ tag: 'tea', is_following: false });
    expect((await unfollowTag(ann, 'tea')).status).toBe(200);
    expect((await unfollowTag(ann, 'nevertagged')).status).toBe(200);
    expect((await mine(ann)).hashtags.map((h) => h.tag)).toEqual(['قهوة', 'ရန်ကုန်']);
  });

  it('refuses what could not be a hashtag, and logged-out changes', async () => {
    for (const bad of ['123', 'two words', 'a-b', '#', 'x'.repeat(101)]) {
      const res = await followTag(ann, bad);
      expect([bad, res.status, res.text]).toEqual([bad, 400, 'That is not a hashtag. Use letters, numbers and _ only.']);
    }
    expect((await info(ann, 'a-b')).status).toBe(400);
    expect((await followTag(ann, 'web3')).status).toBe(200);
    expect((await followTag(ann, 'x'.repeat(100))).status).toBe(200);
    expect((await request(app).put('/hashtags/tea/follow')).status).toBe(401);
    expect((await request(app).get('/followed-hashtags')).status).toBe(401);
  });

  it(`at most ${MAX_FOLLOWS}: one more is refused, following one you have already is still fine`, async () => {
    await pool.query(
      `WITH t AS (INSERT INTO hashtags (tag) SELECT 'tag' || g FROM generate_series(1, $2) g RETURNING id)
       INSERT INTO hashtag_follows (user_id, hashtag_id) SELECT $1, id FROM t`,
      [ann.id, MAX_FOLLOWS]
    );
    const res = await followTag(ann, 'onemore');
    expect([res.status, res.text]).toEqual([400, `You can follow up to ${MAX_FOLLOWS} hashtags.`]);
    expect((await followTag(ann, 'tag7')).status).toBe(200);
    expect((await mine(ann)).hashtags).toHaveLength(MAX_FOLLOWS);
  });

  it('the hashtags you follow are in your data export, and go with your account', async () => {
    await followTag(ann, 'tea');
    const exported = (await request(app).get('/profile/export').set(auth(ann))).body;
    expect(exported.followed_hashtags).toEqual([{ tag: 'tea', since: expect.any(String) }]);
    await pool.query('DELETE FROM users WHERE id = $1', [ann.id]);
    expect((await pool.query('SELECT count(*)::int AS n FROM hashtag_follows')).rows[0].n).toBe(0);
  });

  // Step 2: on Home.
  const post = async (user, content, fields = {}) => {
    const req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(fields)) req.field(k, String(v));
    return (await req).body;
  };
  const feed = async (user) => (await request(app).get('/feed').query({ limit: 50 }).set(auth(user))).body.posts;
  const byContent = (posts) => Object.fromEntries(posts.map((p) => [p.content, p.via_hashtag]));

  it("Home gets the public posts of a tag you follow -- not private accounts', other audiences, groups, blocked, muted or gone authors", async () => {
    const [cara, dan, eve, fay, gus] = [await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app), await registerAndLogin(app)];
    await followTag(ann, 'tea');
    await request(app).post(`/users/${dan.id}/follow`).set(auth(ann));
    await request(app).put('/profile/privacy').set(auth(cara)).send({ isPrivate: true });
    const page = (await request(app).post('/pages').set(auth(eve)).send({ name: 'Tea Shop' })).body;
    const club = (await request(app).post('/communities').set(auth(ben)).send({ name: 'Tea club' })).body;

    await post(ben, 'public #Tea');
    await post(ben, 'followers #tea', { visibility: 'followers' });
    await post(ben, 'no tag at all');
    await post(cara, 'private account #tea');
    await post(eve, 'page #tea', { pageId: page.id });
    await post(ben, 'group #tea', { communityId: club.id });
    await post(fay, 'blocked #tea');
    await request(app).post(`/users/${fay.id}/block`).set(auth(ann));
    await post(gus, 'muted #tea');
    await request(app).post(`/users/${gus.id}/mute`).set(auth(ann));
    await post(dan, 'followed author #tea');
    await post(ann, 'mine #tea');

    expect(byContent(await feed(ann))).toEqual({
      'public #Tea': 'tea',
      'page #tea': 'tea',
      'followed author #tea': null,
      'mine #tea': null
    });
    // Someone who doesn't follow the tag gets none of it.
    expect(byContent(await feed(ben)).hasOwnProperty('page #tea')).toBe(false);

    await request(app).post('/profile/deactivate').set(auth(ben)).send({ password: ben.password });
    await unfollowTag(ann, 'tea');
    expect(Object.keys(byContent(await feed(ann))).sort()).toEqual(['followed author #tea', 'mine #tea']);
  });

  it('a post with several followed tags comes once, named by the tag you followed first; a followed page has no tag line', async () => {
    await followTag(ann, 'tea');
    await followTag(ann, 'coffee');
    await pool.query("UPDATE hashtag_follows SET created_at = now() - interval '1 day' WHERE hashtag_id = (SELECT id FROM hashtags WHERE tag = 'coffee')");
    await post(ben, 'both #tea #coffee');
    const page = (await request(app).post('/pages').set(auth(ben)).send({ name: 'Cafe' })).body;
    await request(app).post(`/pages/${page.id}/follow`).set(auth(ann));
    await post(ben, 'followed page #tea', { pageId: page.id });
    const posts = await feed(ann);
    expect(posts.filter((p) => p.content === 'both #tea #coffee')).toHaveLength(1);
    expect(byContent(posts)).toEqual({ 'both #tea #coffee': 'coffee', 'followed page #tea': null });
  });
});
