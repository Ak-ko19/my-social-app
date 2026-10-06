const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 40: a hashtag page's Top tab -- GET /hashtags/:tag/posts?sort=top
// ranks the tag's newest TOP_CANDIDATES visible posts by the Explore score.
describe('hashtag Top (Day 40)', () => {
  const { app, reset } = setupTestApp();
  // After setupTestApp, so the controller gets the mocked db.
  const { TOP_CANDIDATES } = require('../../controllers/hashtagController');
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, content, visibility) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    if (visibility) req = req.field('visibility', visibility);
    return req.then((r) => r.body);
  };
  const like = (user, p) => request(app).post(`/posts/${p.id}/like`).set(auth(user));
  const commentOn = (user, p) => request(app).post(`/posts/${p.id}/comments`).set(auth(user)).send({ content: 'nice' });
  const ageHours = (postId, hours) =>
    pool.query(`UPDATE posts SET created_at = now() - ($2 || ' hours')::interval WHERE id = $1`, [postId, String(hours)]);
  const top = (user, query = '') =>
    request(app).get(`/hashtags/tea/posts?sort=top${query}`).set(user ? auth(user) : {});
  const contents = (res) => res.body.posts.map((p) => p.content);

  it('ranks by engagement with time decay; comments weigh double; ties go to the newer post', async () => {
    const author = await registerAndLogin(app);
    const fans = [];
    for (let i = 0; i < 3; i++) fans.push(await registerAndLogin(app));
    await post(author, 'quiet one #tea');
    // The commented post is the older one: were comments not weighted
    // double, the tie would put the newer liked post first.
    const commented = await post(author, 'two comments #tea');
    const liked = await post(author, 'two likes #tea');
    await post(author, 'quiet two #tea');
    const old = await post(author, 'old, three likes #tea');
    await like(fans[0], liked);
    await like(fans[1], liked);
    await commentOn(fans[0], commented);
    await commentOn(fans[1], commented);
    for (const f of fans) await like(f, old);
    await ageHours(old.id, 48);
    await post(author, 'another tag #coffee');

    const res = await top(fans[2]);
    expect(res.status).toBe(200);
    expect(res.body.sort).toBe('top');
    // commented: 4 / 2^1.5 > liked: 2 / 2^1.5 > old: 3 / 50^1.5 > the
    // quiet ones (0), newest first.
    expect(contents(res)).toEqual(['two comments #tea', 'two likes #tea', 'old, three likes #tea', 'quiet two #tea', 'quiet one #tea']);
  });

  it('recent stays the default and keeps its order', async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    const first = await post(author, 'first #tea');
    await post(author, 'second #tea');
    await like(fan, first);
    const res = await request(app).get('/hashtags/tea/posts');
    expect(res.body.sort).toBe('recent');
    expect(contents(res)).toEqual(['second #tea', 'first #tea']);
    expect(contents(await top(null))).toEqual(['first #tea', 'second #tea']);
  });

  it('respects visibility and blocks, like the Recent tab', async () => {
    const author = await registerAndLogin(app);
    const follower = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    await request(app).post(`/users/${author.id}/follow`).set(auth(follower));
    const hidden = await post(author, 'followers only #tea', 'followers');
    await like(follower, hidden);
    await post(author, 'just me #tea', 'only_me');
    await post(author, 'public #tea');

    expect(contents(await top(follower))).toEqual(['followers only #tea', 'public #tea']);
    expect(contents(await top(stranger))).toEqual(['public #tea']);
    expect(contents(await top(null))).toEqual(['public #tea']);
    // The author sees their only-me post too; no engagement, so newest first.
    expect(contents(await top(author))).toEqual(['followers only #tea', 'public #tea', 'just me #tea']);

    await request(app).post(`/users/${author.id}/block`).set(auth(stranger));
    expect(contents(await top(stranger))).toEqual([]);
  });

  it('pages without gaps or repeats', async () => {
    const author = await registerAndLogin(app);
    for (let i = 1; i <= 5; i++) await post(author, `post ${i} #tea`);
    const page1 = await top(null, '&limit=2');
    const page2 = await top(null, '&limit=2&page=2');
    const page3 = await top(null, '&limit=2&page=3');
    expect(page1.body.hasMore).toBe(true);
    expect(page3.body.hasMore).toBe(false);
    expect([...contents(page1), ...contents(page2), ...contents(page3)])
      .toEqual(['post 5 #tea', 'post 4 #tea', 'post 3 #tea', 'post 2 #tea', 'post 1 #tea']);
  });

  it(`only the newest ${TOP_CANDIDATES} visible posts are candidates (a bounded read)`, async () => {
    const author = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    // The oldest tagged post is the most liked, but TOP_CANDIDATES newer
    // ones push it out of the candidates.
    const oldest = await post(author, 'oldest #tea');
    await like(fan, oldest);
    const tagId = (await pool.query("SELECT id FROM hashtags WHERE tag = 'tea'")).rows[0].id;
    await pool.query(
      `WITH p AS (
         INSERT INTO posts (user_id, content) SELECT $1, 'bulk ' || g || ' #tea' FROM generate_series(1, $2) g RETURNING id
       ) INSERT INTO post_hashtags (post_id, hashtag_id) SELECT id, $3 FROM p`,
      [author.id, TOP_CANDIDATES, tagId]
    );
    const res = await top(null, '&limit=50&page=' + Math.ceil(TOP_CANDIDATES / 50));
    expect(res.body.hasMore).toBe(false);
    const all = [];
    for (let page = 1; page <= Math.ceil(TOP_CANDIDATES / 50); page++) all.push(...contents(await top(null, `&limit=50&page=${page}`)));
    expect(all).toHaveLength(TOP_CANDIDATES);
    expect(all).not.toContain('oldest #tea');
  });

  it('a bad sort is a 400; an unknown tag is an empty page', async () => {
    expect((await request(app).get('/hashtags/tea/posts?sort=best')).status).toBe(400);
    const res = await request(app).get('/hashtags/nosuchtag/posts?sort=top');
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
  });
});
