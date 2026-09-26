const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B2: multiple images per post (post_media, migration 017). Cloudinary is
// mocked in setupTestApp, so these never upload anything real.
describe('multi-image posts (B2)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  // Tiny valid-enough PNG buffer; the mock never inspects content, but
  // multer's fileFilter checks the declared MIME type.
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const attach = (req, field, name) => req.attach(field, png, { filename: name, contentType: 'image/png' });

  it('creates a post with several images, in the order sent', async () => {
    const author = await registerAndLogin(app);
    let req = request(app).post('/posts').set(auth(author)).field('content', 'three pics');
    req = attach(req, 'images', 'a.png');
    req = attach(req, 'images', 'b.png');
    req = attach(req, 'images', 'c.png');
    const res = await req;

    expect(res.status).toBe(201);
    expect(res.body.media).toHaveLength(3);
    const urls = res.body.media.map((m) => m.url);
    // image_url mirrors the first image for older readers.
    expect(res.body.image_url).toBe(urls[0]);

    const detail = await request(app).get(`/posts/${res.body.id}`).set(auth(author));
    expect(detail.body.media.map((m) => m.url)).toEqual(urls);
  });

  it('still accepts the legacy single "image" field', async () => {
    const author = await registerAndLogin(app);
    const res = await attach(request(app).post('/posts').set(auth(author)).field('content', 'one pic'), 'image', 'x.png');
    expect(res.status).toBe(201);
    expect(res.body.media).toHaveLength(1);
    expect(res.body.image_url).toBe(res.body.media[0].url);
  });

  it('a text-only post has an empty media list and no image_url', async () => {
    const author = await registerAndLogin(app);
    const res = await request(app).post('/posts').set(auth(author)).field('content', 'just words');
    expect(res.status).toBe(201);
    expect(res.body.media).toEqual([]);
    expect(res.body.image_url).toBeNull();
  });

  it('rejects more than 10 images (400) and creates nothing', async () => {
    const author = await registerAndLogin(app);
    let req = request(app).post('/posts').set(auth(author)).field('content', 'too many');
    for (let i = 0; i < 11; i++) req = attach(req, 'images', `p${i}.png`);
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/up to 10 images/);

    const posts = await request(app).get('/posts').set(auth(author));
    expect(posts.body.posts).toHaveLength(0);
  });

  it('rejects a non-image file (400)', async () => {
    const author = await registerAndLogin(app);
    const res = await request(app)
      .post('/posts')
      .set(auth(author))
      .field('content', 'sneaky')
      .attach('images', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('feed and hashtag feed include media', async () => {
    const author = await registerAndLogin(app);
    const follower = await registerAndLogin(app);
    await request(app).post(`/users/${author.id}/follow`).set(auth(follower));
    let req = request(app).post('/posts').set(auth(author)).field('content', 'pics #gallery');
    req = attach(req, 'images', 'a.png');
    req = attach(req, 'images', 'b.png');
    const created = (await req).body;

    const feed = await request(app).get('/feed').set(auth(follower));
    expect(feed.body.posts.find((p) => p.id === created.id).media).toHaveLength(2);

    const tagged = await request(app).get('/hashtags/gallery/posts').set(auth(follower));
    expect(tagged.body.posts.find((p) => p.id === created.id).media).toHaveLength(2);
  });

  it('deleting a post deletes its media rows', async () => {
    const { pool } = require('../helpers/testDb');
    const author = await registerAndLogin(app);
    let req = request(app).post('/posts').set(auth(author)).field('content', 'bye');
    req = attach(req, 'images', 'a.png');
    const created = (await req).body;
    await request(app).delete(`/posts/${created.id}`).set(auth(author));
    const left = await pool.query('SELECT count(*)::int AS n FROM post_media WHERE post_id = $1', [created.id]);
    expect(left.rows[0].n).toBe(0);
  });
});
