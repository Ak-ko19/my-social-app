const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 46: saved posts in named collections (migration 054).
describe('saved collections (Day 46)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const newPost = async (user, content = 'a post', fields = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return (await req).body;
  };
  const create = (user, name) => request(app).post('/collections').set(auth(user)).send({ name });
  const setIn = (user, post, collectionIds) => request(app).put(`/posts/${post.id}/collections`).set(auth(user)).send({ collectionIds });
  const listOf = async (user) => (await request(app).get('/collections').set(auth(user))).body;
  const postsIn = async (user, c) => (await request(app).get(`/collections/${c.id}/posts`).set(auth(user))).body;

  it('creates, lists (newest first), renames and deletes collections', async () => {
    const me = await registerAndLogin(app);
    const recipes = (await create(me, '  Recipes  ')).body;
    expect(recipes).toMatchObject({ name: 'Recipes', post_count: 0, cover_url: null });
    const trips = (await create(me, 'Trips')).body;
    expect((await listOf(me)).map((c) => c.name)).toEqual(['Trips', 'Recipes']);

    const renamed = await request(app).patch(`/collections/${trips.id}`).set(auth(me)).send({ name: 'Weekend trips' });
    expect(renamed.body.name).toBe('Weekend trips');
    expect((await request(app).delete(`/collections/${recipes.id}`).set(auth(me))).status).toBe(200);
    expect((await listOf(me)).map((c) => c.name)).toEqual(['Weekend trips']);
    expect((await request(app).delete(`/collections/${recipes.id}`).set(auth(me))).status).toBe(404);
  });

  it('checks names: required, up to 50, one per name whatever the case, 30 at most', async () => {
    const me = await registerAndLogin(app);
    for (const [name, status, text] of [
      ['', 400, 'A collection needs a name'],
      ['   ', 400, 'A collection needs a name'],
      [42, 400, 'A collection needs a name'],
      ['x'.repeat(51), 400, 'Collection names can be up to 50 characters']
    ]) {
      const res = await create(me, name);
      expect([res.status, res.text]).toEqual([status, text]);
    }
    expect((await create(me, 'x'.repeat(50))).status).toBe(201);
    await create(me, 'Recipes');
    const dup = await create(me, 'RECIPES');
    expect([dup.status, dup.text]).toEqual([409, 'You already have a collection with that name']);
    const other = (await create(me, 'Other')).body;
    expect((await request(app).patch(`/collections/${other.id}`).set(auth(me)).send({ name: 'recipes' })).status).toBe(409);
    // Someone else may have their own "Recipes".
    expect((await create(await registerAndLogin(app), 'Recipes')).status).toBe(201);

    await pool.query("INSERT INTO bookmark_collections (user_id, name) SELECT $1, 'c' || n FROM generate_series(1, 27) n", [me.id]);
    const tooMany = await create(me, 'One more');
    expect([tooMany.status, tooMany.text]).toEqual([400, 'You can have up to 30 collections']);
  });

  it('adding a post saves it; a post can be in several; unsaving takes it out of all', async () => {
    const me = await registerAndLogin(app);
    const author = await registerAndLogin(app);
    const post = await newPost(author, 'Mango sticky rice');
    const [food, sweet] = [(await create(me, 'Food')).body, (await create(me, 'Sweet')).body];

    const res = await setIn(me, post, [food.id, sweet.id, food.id]);
    expect(res.body).toEqual({ saved: true, collectionIds: [food.id, sweet.id].sort((a, b) => a - b) });
    expect((await request(app).get('/bookmarks').set(auth(me))).body.posts.map((p) => p.id)).toEqual([post.id]);
    expect((await postsIn(me, food)).posts.map((p) => p.id)).toEqual([post.id]);
    expect((await request(app).get(`/posts/${post.id}/collections`).set(auth(me))).body.collectionIds).toEqual([food.id, sweet.id].sort((a, b) => a - b));

    // Out of one; then out of all but still saved.
    expect((await setIn(me, post, [sweet.id])).body.collectionIds).toEqual([sweet.id]);
    expect((await postsIn(me, food)).posts).toEqual([]);
    expect((await setIn(me, post, [])).body.collectionIds).toEqual([]);
    expect((await request(app).get('/bookmarks').set(auth(me))).body.posts).toHaveLength(1);

    await setIn(me, post, [food.id]);
    await request(app).delete(`/posts/${post.id}/bookmark`).set(auth(me));
    expect((await postsIn(me, food)).posts).toEqual([]);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM bookmark_collection_items')).rows[0].n).toBe(0);
  });

  it('deleting a collection keeps its posts saved', async () => {
    const me = await registerAndLogin(app);
    const post = await newPost(me);
    const c = (await create(me, 'Mine')).body;
    await setIn(me, post, [c.id]);
    await request(app).delete(`/collections/${c.id}`).set(auth(me));
    expect((await request(app).get('/bookmarks').set(auth(me))).body.posts.map((p) => p.id)).toEqual([post.id]);
  });

  it('count and cover: posts you can still see; cover = the newest added with a photo', async () => {
    const me = await registerAndLogin(app);
    const author = await registerAndLogin(app);
    const c = (await create(me, 'Mixed')).body;
    const textOnly = await newPost(author, 'just text');
    const withPhoto = (await request(app).post('/posts').set(auth(author)).field('content', 'pic')
      .attach('images', Buffer.from('89504e470d0a1a0a', 'hex'), { filename: 'a.png', contentType: 'image/png' })).body;
    await setIn(me, withPhoto, [c.id]);
    await setIn(me, textOnly, [c.id]);
    let [row] = await listOf(me);
    expect(row.post_count).toBe(2);
    expect(row.cover_url).toBe(withPhoto.media[0].url);
    // Most recently added first in the collection.
    expect((await postsIn(me, c)).posts.map((p) => p.id)).toEqual([textOnly.id, withPhoto.id]);

    // The author blocks me: their posts drop out of the count and listing.
    await request(app).post(`/users/${me.id}/block`).set(auth(author));
    [row] = await listOf(me);
    expect(row).toMatchObject({ post_count: 0, cover_url: null });
    expect((await postsIn(me, c)).posts).toEqual([]);
  });

  it('pages through a collection', async () => {
    const me = await registerAndLogin(app);
    const c = (await create(me, 'Many')).body;
    for (let i = 0; i < 3; i += 1) await setIn(me, await newPost(me, `p${i}`), [c.id]);
    const first = (await request(app).get(`/collections/${c.id}/posts?limit=2`).set(auth(me))).body;
    expect([first.posts.map((p) => p.content), first.hasMore]).toEqual([['p2', 'p1'], true]);
    expect(first.collection).toMatchObject({ id: c.id, name: 'Many' });
    const second = (await request(app).get(`/collections/${c.id}/posts?limit=2&page=2`).set(auth(me))).body;
    expect([second.posts.map((p) => p.content), second.hasMore]).toEqual([['p0'], false]);
  });

  it("private: someone else's collections are not found, and can't be used", async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const theirs = (await create(other, 'Theirs')).body;
    const post = await newPost(me);
    expect((await request(app).get(`/collections/${theirs.id}/posts`).set(auth(me))).status).toBe(404);
    expect((await request(app).patch(`/collections/${theirs.id}`).set(auth(me)).send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/collections/${theirs.id}`).set(auth(me))).status).toBe(404);
    const res = await setIn(me, post, [theirs.id]);
    expect([res.status, res.text]).toEqual([404, 'Collection not found']);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM bookmarks')).rows[0].n).toBe(0); // nothing half-done
    expect(await listOf(me)).toEqual([]);
  });

  it("only posts you can see; bad input; logged out", async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const c = (await create(me, 'Mine')).body;
    const hidden = await newPost(other, 'secret', { visibility: 'only_me' });
    expect((await setIn(me, hidden, [c.id])).status).toBe(404);
    const post = await newPost(other);
    for (const collectionIds of [undefined, 'x', [1.5], ['1'], null]) {
      expect((await setIn(me, post, collectionIds)).status).toBe(400);
    }
    expect((await request(app).put('/posts/abc/collections').set(auth(me)).send({ collectionIds: [] })).status).toBe(400);
    expect((await request(app).get('/collections/abc/posts').set(auth(me))).status).toBe(400);
    expect((await request(app).get('/collections')).status).toBe(401);
    expect((await request(app).put(`/posts/${post.id}/collections`).send({ collectionIds: [] })).status).toBe(401);
  });

  it('the data download lists them, and account deletion removes them', async () => {
    const me = await registerAndLogin(app);
    const post = await newPost(me);
    const c = (await create(me, 'Keep')).body;
    await setIn(me, post, [c.id]);
    const data = (await request(app).get('/profile/export').set(auth(me))).body;
    expect(data.saved_collections).toEqual([expect.objectContaining({ name: 'Keep', post_ids: [post.id] })]);
    await pool.query('DELETE FROM users WHERE id = $1', [me.id]);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM bookmark_collections')).rows[0].n).toBe(0);
  });
});
