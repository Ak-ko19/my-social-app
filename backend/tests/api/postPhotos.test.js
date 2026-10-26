const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 96: editing a published post's photos -- remove, add, reorder and
// describe them (PUT /posts/:id/media). Cloudinary is mocked.
describe("editing a post's photos (Day 96)", () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const withPhotos = (req, n) => {
    for (let i = 0; i < n; i++) req = req.attach('images', png, { filename: `p${i}.png`, contentType: 'image/png' });
    return req;
  };
  const postWith = async (user, n, fields = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', fields.content || 'photos');
    for (const [k, v] of Object.entries(fields)) if (k !== 'content') req = req.field(k, v);
    return (await withPhotos(req, n)).body;
  };
  const edit = (user, post, fields = {}, uploads = 0) => {
    let req = request(app).put(`/posts/${post.id}/media`).set(auth(user));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, typeof v === 'string' ? v : JSON.stringify(v));
    // A multipart body even with no fields or files.
    if (Object.keys(fields).length === 0 && uploads === 0) req = req.field('photos', JSON.stringify(post.media.map((m) => m.url)));
    return withPhotos(req, uploads);
  };
  const mediaOf = async (user, post) => (await request(app).get(`/posts/${post.id}`).set(auth(user))).body.media;

  it('removes, adds and reorders in one step; image_url follows the first photo', async () => {
    const me = await registerAndLogin(app);
    const post = await postWith(me, 3, { altTexts: JSON.stringify(['one', 'two', 'three']) });
    const [a, , c] = post.media.map((m) => m.url);
    // New order: a new photo first, then c, then a; b is removed.
    const res = await edit(me, post, { photos: [{ upload: 0 }, c, a] }, 1);
    expect(res.status).toBe(200);
    const urls = res.body.media.map((m) => m.url);
    expect(urls.slice(1)).toEqual([c, a]);
    expect(urls[0]).not.toBe(a);
    // Each kept photo keeps its description; the new one has none.
    expect(res.body.media.map((m) => m.alt)).toEqual([null, 'three', 'one']);
    expect((await mediaOf(me, post)).map((m) => m.url)).toEqual(urls);
    expect((await pool.query('SELECT image_url FROM posts WHERE id = $1', [post.id])).rows[0].image_url).toBe(urls[0]);
  });

  it('descriptions can be changed with the order; every photo can go', async () => {
    const me = await registerAndLogin(app);
    const post = await postWith(me, 2);
    const [a, b] = post.media.map((m) => m.url);
    const res = await edit(me, post, { photos: [b, a], altTexts: ['A red kite', ''] });
    expect(res.body.media).toEqual([{ url: b, alt: 'A red kite' }, { url: a, alt: null }]);
    const none = await edit(me, post, { photos: [] });
    expect(none.body.media).toEqual([]);
    expect((await pool.query('SELECT image_url FROM posts WHERE id = $1', [post.id])).rows[0].image_url).toBeNull();
  });

  it('without photos: everything stays and new ones go after', async () => {
    const me = await registerAndLogin(app);
    const post = await postWith(me, 1, { altTexts: JSON.stringify(['kept']) });
    const res = await edit(me, post, { altTexts: ['kept', 'new one'] }, 1);
    expect(res.body.media.map((m) => m.alt)).toEqual(['kept', 'new one']);
    expect(res.body.media[0].url).toBe(post.media[0].url);
  });

  it("refuses someone else's photos, a bad list, unused uploads, 11 photos, a share and a poll", async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const post = await postWith(me, 1);
    const [a] = post.media.map((m) => m.url);
    expect((await edit(other, post, { photos: [a] })).status).toBe(403);
    expect((await edit(me, { id: 999999 }, { photos: [] })).status).toBe(404);
    // Each case is wrong in one way only (the upload, when sent, is used).
    for (const [photos, uploads] of [
      ['nope', 0], [{ a: 1 }, 0], [['https://elsewhere/x.png'], 0], [[a, a], 0],
      [[{ upload: 0 }, { upload: 1 }], 1], [[{ upload: -1 }, { upload: 0 }], 1], [[{ upload: 0 }, { upload: 0 }], 1]
    ]) {
      const res = await edit(me, post, { photos }, uploads);
      expect([JSON.stringify(photos), res.status, res.text]).toEqual([JSON.stringify(photos), 400, 'Invalid photos']);
    }
    // An upload that isn't placed is refused too (not silently dropped).
    expect((await edit(me, post, { photos: [a] }, 1)).text).toBe('Invalid photos');
    const ten = await postWith(me, 10);
    expect((await edit(me, ten, {}, 1)).text).toBe('You can attach up to 10 images');

    const fan = await registerAndLogin(app);
    const shared = (await request(app).post(`/posts/${post.id}/share`).set(auth(fan)).send({})).body;
    const onShare = await edit(fan, shared, { photos: [{ upload: 0 }] }, 1);
    expect([onShare.status, onShare.text]).toEqual([400, "A share can't have photos."]);
    const poll = (await request(app).post('/posts').set(auth(me)).field('content', 'Tea or coffee?')
      .field('poll', JSON.stringify({ options: ['Tea', 'Coffee'], durationHours: 24 }))).body;
    expect((await edit(me, poll, { photos: [{ upload: 0 }] }, 1)).text).toBe("A poll can't have photos");
    // Nothing changed on refused requests.
    expect((await mediaOf(me, post)).map((m) => m.url)).toEqual([a]);
  });

  it("a page's admin can edit the page's post", async () => {
    const owner = await registerAndLogin(app);
    const admin = await registerAndLogin(app);
    const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Tea Shop' })).body;
    await request(app).post(`/pages/${page.id}/admins`).set(auth(owner)).send({ username: admin.username });
    const post = await postWith(owner, 1, { pageId: String(page.id) });
    const res = await edit(admin, post, { photos: [] });
    expect(res.status).toBe(200);
    expect(res.body.media).toEqual([]);
  });

  it('removed photos leave storage after the change is saved', async () => {
    const me = await registerAndLogin(app);
    const post = await postWith(me, 2);
    const [a, b] = post.media.map((m) => m.url);
    const cleanup = require('../../services/mediaCleanupService');
    const seen = [];
    // When the files go, the post must already be saved without them.
    jest.spyOn(cleanup, 'deleteMedia').mockImplementation(async (urls) => {
      const rows = (await pool.query('SELECT url FROM post_media WHERE post_id = $1', [post.id])).rows.map((r) => r.url);
      seen.push({ urls, rows });
    });
    await edit(me, post, { photos: [b] });
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([{ urls: [a], rows: [b] }]);
    // A refused edit deletes nothing of the post's.
    seen.length = 0;
    await edit(me, post, { photos: ['https://elsewhere/x.png'] });
    expect(seen).toEqual([]);
  });

  it('drafts take the same order: a new photo before a kept one', async () => {
    const me = await registerAndLogin(app);
    const draft = (await withPhotos(request(app).post('/drafts').set(auth(me)).field('content', 'later').field('altTexts', JSON.stringify(['kept'])), 1)).body;
    const [a] = draft.media.map((m) => m.url);
    const saved = (await withPhotos(request(app).put(`/drafts/${draft.id}`).set(auth(me)).field('content', 'later')
      .field('photos', JSON.stringify([{ upload: 0 }, a])), 1)).body;
    expect(saved.media[1]).toEqual({ url: a, alt: 'kept' });
    expect(saved.media[0].alt).toBeNull();
    const bad = await withPhotos(request(app).put(`/drafts/${draft.id}`).set(auth(me)).field('content', 'later').field('photos', JSON.stringify([a])), 1);
    expect([bad.status, bad.text]).toEqual([400, 'Invalid photos']);
  });

  it('needs a login and a whole-number id', async () => {
    expect((await request(app).put('/posts/1/media').field('photos', '[]')).status).toBe(401);
    const me = await registerAndLogin(app);
    expect((await request(app).put('/posts/1.5/media').set(auth(me)).field('photos', '[]')).status).toBe(400);
  });
});
