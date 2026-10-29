const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Days 109-110: the post's author pins one comment -- first on page 1 in
// both orders, never again on a later page.
describe('pinned comment (Days 109-110)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const say = async (user, content, parentCommentId) =>
    (await request(app).post(`/posts/${post.id}/comments`).set(auth(user)).send({ content, parentCommentId })).body;
  const pin = (user, commentId, postId = post.id) => request(app).put(`/posts/${postId}/pinned-comment`).set(auth(user)).send({ commentId });
  const unpin = (user, postId = post.id) => request(app).delete(`/posts/${postId}/pinned-comment`).set(auth(user));
  const walk = async (user, sort, limit = 2) => {
    const pages = [];
    let cursor = '';
    do {
      const req = request(app).get(`/posts/${post.id}/comments`).query({ sort, limit, cursor });
      const body = (await (user ? req.set(auth(user)) : req)).body;
      pages.push(body.comments.filter((c) => c.parent_comment_id === null).map((c) => `${c.content}${c.is_pinned ? '*' : ''}`));
      cursor = body.nextCursor;
    } while (cursor);
    return pages;
  };

  let author;
  let ann;
  let bob;
  let post;
  beforeEach(async () => {
    author = await registerAndLogin(app);
    ann = await registerAndLogin(app);
    bob = await registerAndLogin(app);
    post = (await request(app).post('/posts').set(auth(author)).field('content', 'pin me')).body;
  });

  it('the pinned comment starts page 1 in both orders, with its replies, and never comes again', async () => {
    const c1 = await say(ann, 'c1');
    await say(bob, 'reply to c1', c1.id);
    for (const content of ['c2', 'c3', 'c4']) await say(bob, content);
    expect((await pin(author, c1.id)).body).toEqual({ pinned_comment_id: c1.id });

    expect(await walk(null, 'newest')).toEqual([['c1*', 'c4', 'c3'], ['c2']]);
    // Most relevant would put c1 first anyway (it has a reply); the rest by age.
    expect(await walk(null, 'relevant')).toEqual([['c1*', 'c4', 'c3'], ['c2']]);
    const first = (await request(app).get(`/posts/${post.id}/comments`).query({ sort: 'newest', limit: 2 })).body.comments;
    expect(first.map((c) => c.content)).toEqual(['c1', 'c4', 'c3', 'reply to c1']);
    expect(first[0]).toMatchObject({ is_pinned: true, reply_count: 1 });
    expect(first[1].is_pinned).toBe(false);

    // Pinning another replaces it; unpinning gives the usual order back.
    const c3 = first.find((c) => c.content === 'c3');
    await pin(author, c3.id);
    expect(await walk(null, 'newest')).toEqual([['c3*', 'c4', 'c2'], ['c1']]);
    expect((await unpin(author)).body).toEqual({ pinned_comment_id: null });
    expect((await unpin(author)).status).toBe(200);
    expect(await walk(null, 'newest')).toEqual([['c4', 'c3'], ['c2', 'c1']]);
  });

  it('only the post\'s author pins (a page\'s owner and admins for its posts); a top-level, approved comment of this post', async () => {
    const c1 = await say(ann, 'c1');
    const reply = await say(bob, 'reply', c1.id);
    expect((await pin(ann, c1.id)).text).toBe("Only the post's author can pin a comment.");
    expect((await unpin(ann)).status).toBe(403);
    expect((await pin(author, reply.id)).text).toBe('Only a comment, not a reply, can be pinned.');
    const other = (await request(app).post('/posts').set(auth(author)).field('content', 'other')).body;
    expect((await pin(author, c1.id, other.id)).text).toBe('That comment is not on this post.');
    expect((await pin(author, 999999)).text).toBe('That comment is not on this post.');
    expect((await pin(author, 'x')).text).toBe('Invalid comment ID');
    await request(app).post(`/users/${bob.id}/restrict`).set(auth(author));
    const held = await say(bob, 'held');
    expect((await pin(author, held.id)).text).toBe('Approve the comment before pinning it.');
    await request(app).put(`/posts/${post.id}`).set(auth(author)).send({ visibility: 'only_me' });
    expect((await pin(ann, c1.id)).status).toBe(404);

    const page = (await request(app).post('/pages').set(auth(author)).send({ name: 'Cafe' })).body;
    await request(app).post(`/pages/${page.id}/admins`).set(auth(author)).send({ username: bob.username });
    const pagePost = (await request(app).post('/posts').set(auth(author)).field('content', 'menu').field('pageId', String(page.id))).body;
    const onPage = (await request(app).post(`/posts/${pagePost.id}/comments`).set(auth(ann)).send({ content: 'yum' })).body;
    expect((await pin(bob, onPage.id, pagePost.id)).status).toBe(200);
    expect((await pin(ann, onPage.id, pagePost.id)).status).toBe(403);
  });

  it('a pinned comment someone may not see (a block) is left out for them; deleting it unpins the post', async () => {
    const c1 = await say(ann, 'c1');
    await say(bob, 'c2');
    await pin(author, c1.id);
    await request(app).post(`/users/${ann.id}/block`).set(auth(bob));
    expect(await walk(bob, 'newest')).toEqual([['c2']]);
    expect(await walk(null, 'newest')).toEqual([['c1*', 'c2']]);

    await request(app).delete(`/comments/${c1.id}`).set(auth(ann));
    expect((await pool.query('SELECT pinned_comment_id FROM posts WHERE id = $1', [post.id])).rows[0].pinned_comment_id).toBeNull();
    expect(await walk(null, 'newest')).toEqual([['c2']]);
  });

  it('a post with a pinned comment can still be deleted (each points at the other)', async () => {
    const c1 = await say(ann, 'c1');
    await pin(author, c1.id);
    expect((await request(app).delete(`/posts/${post.id}`).set(auth(author))).status).toBe(200);
    expect((await pool.query('SELECT count(*)::int AS n FROM comments WHERE id = $1', [c1.id])).rows[0].n).toBe(0);
  });
});
