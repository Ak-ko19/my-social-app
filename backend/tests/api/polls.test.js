const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 44: poll posts (migration 050). The post's text is the question;
// 2-4 options; one anonymous vote per person; per-option counts only for
// voters, the author, and everyone once the poll has ended.
describe('polls (Day 44)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const pollPost = (user, options, extra = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', extra.content || 'Tea or coffee?')
      .field('poll', JSON.stringify({ options, ...(extra.durationHours ? { durationHours: extra.durationHours } : {}) }));
    for (const [k, v] of Object.entries(extra.fields || {})) req = req.field(k, v);
    return req;
  };
  const vote = (user, postId, optionId) => request(app).post(`/posts/${postId}/poll/vote`).set(auth(user)).send({ optionId });
  const getPost = (user, id) => request(app).get(`/posts/${id}`).set(user ? auth(user) : {});
  const postCount = async () => (await pool.query('SELECT COUNT(*)::int AS n FROM posts')).rows[0].n;

  it('creates a poll post; the author sees the (empty) results', async () => {
    const author = await registerAndLogin(app);
    const res = await pollPost(author, [' Tea ', 'Coffee', 'Neither']);
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Tea or coffee?');
    const { poll } = res.body;
    expect(poll).toMatchObject({ closed: false, total_votes: 0, my_vote: null, show_results: true });
    expect(poll.options.map((o) => [o.label, o.votes])).toEqual([['Tea', 0], ['Coffee', 0], ['Neither', 0]]);
    // One day by default.
    const hours = (new Date(poll.closes_at) - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('takes a poll as JSON too, and a 3-day or 1-week length', async () => {
    const author = await registerAndLogin(app);
    const res = await request(app).post('/posts').set(auth(author))
      .send({ content: 'Weekend?', poll: { options: ['Beach', 'Hills'], durationHours: 168 } });
    expect(res.status).toBe(201);
    expect((new Date(res.body.poll.closes_at) - Date.now()) / 3600000).toBeGreaterThan(167.9);
    expect((await pollPost(author, ['a', 'b'], { durationHours: 72 })).status).toBe(201);
  });

  it('refuses a poll that is not valid, and creates nothing', async () => {
    const author = await registerAndLogin(app);
    const cases = [
      [['only one'], 'A poll needs 2 to 4 options'],
      [['a', 'b', 'c', 'd', 'e'], 'A poll needs 2 to 4 options'],
      [['a', '  '], 'Poll options cannot be empty'],
      [['a', 'x'.repeat(51)], 'Poll options must be 50 characters or fewer'],
      [['Tea', 'tea'], 'Poll options must be different'],
      [['a', 7], 'Invalid poll']
    ];
    for (const [options, message] of cases) {
      const res = await pollPost(author, options);
      expect([res.status, res.text]).toEqual([400, message]);
    }
    expect((await pollPost(author, ['a', 'b'], { durationHours: 12 })).text).toBe('Poll length must be one of: 24, 72, 168 hours');
    for (const poll of ['not json', '{"options":"a,b"}', 'null', '[]']) {
      const res = await request(app).post('/posts').set(auth(author)).field('content', 'q').field('poll', poll);
      expect(res.status).toBe(400);
    }
    expect((await pollPost(author, ['a', 'b'], { content: '  ' })).text).toBe('Post content cannot be empty');
    expect(await postCount()).toBe(0);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM polls')).rows[0].n).toBe(0);
  });

  it('stores options typed in Zawgyi as Unicode, measured after converting', async () => {
    const author = await registerAndLogin(app);
    const res = await pollPost(author, ['လက္ဖက္ရည္', 'ေကာ္ဖီ']);
    expect(res.body.poll.options.map((o) => o.label)).toEqual(['လက်ဖက်ရည်', 'ကော်ဖီ']);
    // 48 characters typed, 60 once converted: over the column's 50.
    const grows = await pollPost(author, ['မဂၤလာပါ '.repeat(6).trim(), 'b']);
    expect([grows.status, grows.text]).toEqual([400, 'Poll options must be 50 characters or fewer']);
  });

  it("doesn't take photos with a poll, and removes the uploaded ones", async () => {
    const cloudinary = require('../../config/cloudinary');
    const env = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      cloudinary.api.delete_resources.mockClear();
      const author = await registerAndLogin(app);
      const res = await pollPost(author, ['a', 'b'])
        .attach('images', Buffer.from('89504e470d0a1a0a', 'hex'), { filename: 'a.png', contentType: 'image/png' });
      expect([res.status, res.text]).toEqual([400, "A poll can't have photos"]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(cloudinary.api.delete_resources.mock.calls.flatMap(([batch]) => batch)).toHaveLength(1);
      expect(await postCount()).toBe(0);
    } finally {
      Object.assign(process.env, saved);
    }
  });

  it('a vote counts once; the results show only after voting', async () => {
    const author = await registerAndLogin(app);
    const voter = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const post = (await pollPost(author, ['Tea', 'Coffee'])).body;
    const [tea, coffee] = post.poll.options.map((o) => o.id);

    // Before voting: options and the total, no per-option counts.
    const before = (await getPost(voter, post.id)).body.poll;
    expect(before).toMatchObject({ show_results: false, my_vote: null, total_votes: 0 });
    expect(before.options.map((o) => o.votes)).toEqual([null, null]);

    const first = await vote(voter, post.id, coffee);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ show_results: true, my_vote: coffee, total_votes: 1 });
    expect(first.body.options.map((o) => o.votes)).toEqual([0, 1]);

    // A double tap repeats the same vote: no change.
    const again = await vote(voter, post.id, coffee);
    expect([again.status, again.body.total_votes]).toEqual([200, 1]);
    // A vote can't be changed.
    const change = await vote(voter, post.id, tea);
    expect([change.status, change.text]).toEqual([409, 'You already voted in this poll']);

    expect((await vote(other, post.id, tea)).body.options.map((o) => o.votes)).toEqual([1, 1]);
    // Someone who hasn't voted still doesn't see them -- nor does a
    // visitor -- but sees the total; nobody sees who voted.
    const third = await registerAndLogin(app);
    const seen = (await getPost(third, post.id)).body.poll;
    expect(seen).toMatchObject({ show_results: false, total_votes: 2 });
    expect(seen.options.map((o) => o.votes)).toEqual([null, null]);
    expect((await getPost(null, post.id)).body.poll.options.map((o) => o.votes)).toEqual([null, null]);
    expect(Object.keys(seen).sort()).toEqual(['closed', 'closes_at', 'my_vote', 'options', 'show_results', 'total_votes']);
    expect(Object.keys(seen.options[0]).sort()).toEqual(['id', 'label', 'votes']);
    // The author can vote in their own poll too.
    expect((await vote(author, post.id, tea)).status).toBe(201);
  });

  it('refuses a bad vote', async () => {
    const author = await registerAndLogin(app);
    const voter = await registerAndLogin(app);
    const post = (await pollPost(author, ['a', 'b'])).body;
    const elsewhere = (await pollPost(author, ['c', 'd'])).body;
    const plain = (await request(app).post('/posts').set(auth(author)).field('content', 'no poll')).body;
    expect((await vote(voter, post.id, elsewhere.poll.options[0].id)).text).toBe('Invalid option');
    expect((await vote(voter, post.id, '1')).status).toBe(400);
    expect((await vote(voter, post.id, undefined)).status).toBe(400);
    expect((await vote(voter, plain.id, 1)).status).toBe(404);
    expect((await vote(voter, 999999, 1)).status).toBe(404);
    expect((await vote(voter, 'abc', 1)).status).toBe(400);
    expect((await request(app).post(`/posts/${post.id}/poll/vote`).send({ optionId: post.poll.options[0].id })).status).toBe(401);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM poll_votes')).rows[0].n).toBe(0);
  });

  it("can't vote in a poll you can't see (blocked, followers only)", async () => {
    const author = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    const blocked = await registerAndLogin(app);
    const followersOnly = (await pollPost(author, ['a', 'b'], { fields: { visibility: 'followers' } })).body;
    expect((await vote(stranger, followersOnly.id, followersOnly.poll.options[0].id)).status).toBe(404);
    const open = (await pollPost(author, ['a', 'b'])).body;
    await request(app).post(`/users/${blocked.id}/block`).set(auth(author));
    expect((await vote(blocked, open.id, open.poll.options[0].id)).status).toBe(404);
  });

  it('an ended poll takes no votes and shows everyone the results', async () => {
    const author = await registerAndLogin(app);
    const voter = await registerAndLogin(app);
    const late = await registerAndLogin(app);
    const post = (await pollPost(author, ['a', 'b'])).body;
    const [a] = post.poll.options.map((o) => o.id);
    await vote(voter, post.id, a);
    await pool.query("UPDATE polls SET closes_at = now() - interval '1 second' WHERE post_id = $1", [post.id]);
    const res = await vote(late, post.id, a);
    expect([res.status, res.text]).toEqual([409, 'This poll has ended']);
    for (const viewer of [late, null]) {
      const poll = (await getPost(viewer, post.id)).body.poll;
      expect(poll).toMatchObject({ closed: true, show_results: true, total_votes: 1 });
      expect(poll.options.map((o) => o.votes)).toEqual([1, 0]);
    }
    // Repeating your own vote on an ended poll is still harmless.
    expect((await vote(voter, post.id, a)).status).toBe(200);
  });

  it('shows the poll in feeds and lists, in groups and on pages', async () => {
    const author = await registerAndLogin(app);
    const reader = await registerAndLogin(app);
    await request(app).post(`/users/${author.id}/follow`).set(auth(reader));
    const post = (await pollPost(author, ['a', 'b'], { content: 'Poll #weekend' })).body;
    await vote(reader, post.id, post.poll.options[1].id);
    await request(app).post(`/posts/${post.id}/like`).set(auth(reader)); // Explore lists liked posts
    const pollIn = (list) => list.find((p) => p.id === post.id)?.poll;
    const lists = [
      (await request(app).get('/feed').set(auth(reader))).body.posts,
      (await request(app).get('/posts').set(auth(reader))).body.posts,
      (await request(app).get(`/users/${author.id}/posts`).set(auth(reader))).body.posts,
      (await request(app).get('/hashtags/weekend/posts').set(auth(reader))).body.posts,
      (await request(app).get('/explore/posts').set(auth(reader))).body.posts,
      await (async () => {
        await request(app).post(`/posts/${post.id}/bookmark`).set(auth(reader));
        return (await request(app).get('/bookmarks').set(auth(reader))).body.posts;
      })()
    ];
    for (const list of lists) expect(pollIn(list)).toMatchObject({ my_vote: post.poll.options[1].id, total_votes: 1 });

    const community = (await request(app).post('/communities').set(auth(author)).send({ name: 'Club' })).body;
    const inGroup = await pollPost(author, ['a', 'b'], { fields: { communityId: String(community.id) } });
    expect(inGroup.status).toBe(201);
    const page = (await request(app).post('/pages').set(auth(author)).send({ name: 'Shop' })).body;
    const onPage = await pollPost(author, ['a', 'b'], { fields: { pageId: String(page.id) } });
    expect(onPage.status).toBe(201);
    const groupList = (await request(app).get(`/communities/${community.id}/posts`).set(auth(author))).body.posts;
    expect(groupList.find((p) => p.id === inGroup.body.id).poll.options.map((o) => o.label)).toEqual(['a', 'b']);
    const pageList = (await request(app).get(`/pages/${page.id}/posts`).set(auth(reader))).body.posts;
    expect(pageList.find((p) => p.id === onPage.body.id).poll).toMatchObject({ show_results: false, total_votes: 0 });
  });

  it("editing the question keeps the poll; deleting the post or an account removes what's theirs", async () => {
    const author = await registerAndLogin(app);
    const voter = await registerAndLogin(app);
    const post = (await pollPost(author, ['a', 'b'])).body;
    await vote(voter, post.id, post.poll.options[0].id);
    const edited = await request(app).put(`/posts/${post.id}`).set(auth(author)).send({ content: 'Better question?' });
    expect(edited.status).toBe(200);
    expect((await getPost(author, post.id)).body.poll.total_votes).toBe(1);

    // The voter leaves: their vote goes with their account.
    await request(app).delete('/profile').set(auth(voter)).send({ password: voter.password });
    expect((await getPost(author, post.id)).body.poll.total_votes).toBe(0);

    expect((await request(app).delete(`/posts/${post.id}`).set(auth(author))).status).toBe(200);
    for (const table of ['polls', 'poll_options', 'poll_votes']) {
      expect((await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
    }
  });

  it('the data download has your polls and your votes', async () => {
    const author = await registerAndLogin(app);
    const voter = await registerAndLogin(app);
    const post = (await pollPost(author, ['Tea', 'Coffee'])).body;
    await vote(voter, post.id, post.poll.options[1].id);
    const mine = (await request(app).get('/profile/export').set(auth(author))).body;
    expect(mine.posts[0].poll.options).toEqual([{ label: 'Tea', votes: 0 }, { label: 'Coffee', votes: 1 }]);
    expect(mine.poll_votes).toEqual([]);
    const theirs = (await request(app).get('/profile/export').set(auth(voter))).body;
    expect(theirs.poll_votes).toEqual([expect.objectContaining({ post_id: post.id, option: 'Coffee' })]);
  });
});
