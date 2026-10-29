const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

describe('comments', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  async function makePost(token, content = 'commentable post') {
    const res = await request(app).post('/posts').set('Authorization', `Bearer ${token}`).field('content', content);
    return res.body;
  }

  it('creates a comment on a post', async () => {
    const author = await registerAndLogin(app);
    const commenter = await registerAndLogin(app);
    const post = await makePost(author.token);

    const res = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'nice post!' });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('nice post!');
  });

  it('rejects an empty comment', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    const res = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  // Day 70: a page at a time. Days 109-110: a page is a number of threads
  // (top-level comments), each followed by its first replies.
  it('pages through the threads with no gaps or repeats, in either order; replies come with their comment', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    const say = (content, parentCommentId) => request(app).post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${author.token}`).send({ content, parentCommentId });
    const first = (await say('c1')).body;
    for (const content of ['c2', 'c3', 'c4']) await say(content);
    await say('reply to c1', first.id);
    await say('c5');

    const walk = async (sort) => {
      const seen = [];
      let cursor = '';
      let pages = 0;
      do {
        const res = await request(app).get(`/posts/${post.id}/comments?sort=${sort}&limit=2&cursor=${cursor}`);
        expect(res.status).toBe(200);
        expect(res.body.sort).toBe(sort);
        expect(res.body.comments.filter((c) => c.parent_comment_id === null).length).toBeLessThanOrEqual(2);
        seen.push(...res.body.comments.map((c) => c.content));
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor);
      return { seen, pages };
    };
    expect(await walk('newest')).toEqual({ seen: ['c5', 'c4', 'c3', 'c2', 'c1', 'reply to c1'], pages: 3 });
    // Most relevant: c1 has a reply, so it ranks first; the rest are equal (newest first).
    expect(await walk('relevant')).toEqual({ seen: ['c1', 'c5', 'reply to c1', 'c4', 'c3', 'c2'], pages: 3 });

    const all = await request(app).get(`/posts/${post.id}/comments`);
    expect([all.body.sort, all.body.comments.length, all.body.nextCursor]).toEqual(['relevant', 6, null]);
    expect(all.body.comments[0]).toMatchObject({ content: 'c1', reply_count: 1 });
  });

  it('refuses a bad cursor or sort; a huge limit is not an error (the server caps it)', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    for (const cursor of ['abc', '-1', '1.5']) {
      expect([cursor, (await request(app).get(`/posts/${post.id}/comments?cursor=${cursor}`)).status]).toEqual([cursor, 400]);
    }
    const badSort = await request(app).get(`/posts/${post.id}/comments?sort=oldest`);
    expect([badSort.status, badSort.text]).toEqual([400, 'sort must be relevant or newest']);
    expect((await request(app).get(`/posts/${post.id}/comments?limit=5000`)).status).toBe(200);
  });

  // Days 109-110: Most relevant (the default) puts liked comments first;
  // Newest is newest first.
  it('lists the most relevant first by default, or the newest', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    const first = (await request(app).post(`/posts/${post.id}/comments`).set('Authorization', `Bearer ${author.token}`).send({ content: 'first' })).body;
    await request(app).post(`/posts/${post.id}/comments`).set('Authorization', `Bearer ${author.token}`).send({ content: 'second' });
    await request(app).post(`/comments/${first.id}/like`).set('Authorization', `Bearer ${author.token}`);

    const res = await request(app).get(`/posts/${post.id}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.comments.map((c) => c.content)).toEqual(['first', 'second']);
    const newest = await request(app).get(`/posts/${post.id}/comments?sort=newest`);
    expect(newest.body.comments.map((c) => c.content)).toEqual(['second', 'first']);
  });

  it('rejects editing someone else\'s comment with 403', async () => {
    const author = await registerAndLogin(app);
    const commenter = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const post = await makePost(author.token);
    const commentRes = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${commenter.token}`)
      .send({ content: 'mine' });

    const res = await request(app)
      .put(`/comments/${commentRes.body.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ content: 'hijacked' });
    expect(res.status).toBe(403);
  });

  it('lets the owner delete their own comment', async () => {
    const author = await registerAndLogin(app);
    const post = await makePost(author.token);
    const commentRes = await request(app)
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ content: 'delete me' });

    const res = await request(app).delete(`/comments/${commentRes.body.id}`).set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(200);

    const list = await request(app).get(`/posts/${post.id}/comments`);
    expect(list.body.comments).toHaveLength(0);
  });

  it('404s commenting on a post that does not exist', async () => {
    const user = await registerAndLogin(app);
    const res = await request(app)
      .post('/posts/999999/comments')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ content: 'orphan comment' });
    expect(res.status).toBe(404);
  });
});
