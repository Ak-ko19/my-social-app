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
});
