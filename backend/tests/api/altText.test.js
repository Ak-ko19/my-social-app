const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 95: a description you write for each photo (alt text), which screen
// readers read instead of "Photo 1 of 3". Cloudinary is mocked.
describe('photo descriptions (Day 95)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const withPhotos = (req, n) => {
    for (let i = 0; i < n; i++) req = req.attach('images', png, { filename: `p${i}.png`, contentType: 'image/png' });
    return req;
  };
  const postWith = (user, n, fields = {}) => {
    let req = request(app).post('/posts').set(auth(user));
    if (!('content' in fields)) req = req.field('content', 'photos');
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return withPhotos(req, n);
  };
  const alts = (media) => media.map((m) => m.alt);
  const ZAWGYI = 'ေမာင္ေမာင္ ေနေကာင္းလား';
  const UNICODE = 'မောင်မောင် နေကောင်းလား';

  it('each photo keeps its own description, in order; empty means none', async () => {
    const me = await registerAndLogin(app);
    const res = await postWith(me, 3, { altTexts: JSON.stringify(['  A red kite over the hill  ', '', null]) });
    expect(res.status).toBe(201);
    expect(alts(res.body.media)).toEqual(['A red kite over the hill', null, null]);
    const read = await request(app).get(`/posts/${res.body.id}`).set(auth(me));
    expect(alts(read.body.media)).toEqual(['A red kite over the hill', null, null]);
    // Fewer than the photos: the rest have none. Left out: none at all.
    expect(alts((await postWith(me, 2, { altTexts: JSON.stringify(['only the first']) })).body.media)).toEqual(['only the first', null]);
    expect(alts((await postWith(me, 1)).body.media)).toEqual([null]);
  });

  it('refuses a bad list, too many entries and a description over 1000 characters', async () => {
    const me = await registerAndLogin(app);
    for (const bad of ['not json', JSON.stringify({ a: 1 }), JSON.stringify([1]), JSON.stringify(['a', 'b'])]) {
      const res = await postWith(me, 1, { altTexts: bad });
      expect([bad, res.status, res.text]).toEqual([bad, 400, 'Invalid altTexts']);
    }
    const long = await postWith(me, 1, { altTexts: JSON.stringify(['x'.repeat(1001)]) });
    expect([long.status, long.text]).toEqual([400, 'A photo description can be up to 1000 characters.']);
    expect((await postWith(me, 1, { altTexts: JSON.stringify(['x'.repeat(1000)]) })).status).toBe(201);
  });

  it('Burmese typed in Zawgyi is kept as Unicode', async () => {
    const me = await registerAndLogin(app);
    const res = await postWith(me, 1, { altTexts: JSON.stringify([ZAWGYI]) });
    expect(alts(res.body.media)).toEqual([UNICODE]);
  });

  it('every list returns it, and a share shows it on the shared photo', async () => {
    const me = await registerAndLogin(app);
    const fan = await registerAndLogin(app);
    await request(app).post(`/users/${me.id}/follow`).set(auth(fan));
    const post = (await postWith(me, 1, { content: 'Hill #kites', altTexts: JSON.stringify(['A red kite']) })).body;
    const shared = (await request(app).post(`/posts/${post.id}/share`).set(auth(fan)).send({})).body;
    const lists = {
      feed: (await request(app).get('/feed').set(auth(fan))).body.posts,
      profile: (await request(app).get(`/users/${me.id}/posts`).set(auth(fan))).body.posts,
      hashtag: (await request(app).get('/hashtags/kites/posts').set(auth(fan))).body.posts
    };
    for (const [name, list] of Object.entries(lists)) {
      expect([name, list.find((p) => p.id === post.id)?.media[0].alt]).toEqual([name, 'A red kite']);
    }
    expect((await request(app).get(`/posts/${shared.id}`).set(auth(fan))).body.shared_post.media[0].alt).toBe('A red kite');
  });

  it('drafts keep descriptions: create, keep and reorder, change, publish', async () => {
    const me = await registerAndLogin(app);
    let req = request(app).post('/drafts').set(auth(me)).field('content', 'later').field('altTexts', JSON.stringify(['first', 'second']));
    const draft = (await withPhotos(req, 2)).body;
    expect(alts(draft.media)).toEqual(['first', 'second']);
    const [a, b] = draft.media.map((m) => m.url);

    // Reordered, no altTexts: each photo keeps its own; a new one has none.
    req = request(app).put(`/drafts/${draft.id}`).set(auth(me)).field('content', 'later').field('keepMedia', JSON.stringify([b, a]));
    let saved = (await withPhotos(req, 1)).body;
    expect(alts(saved.media)).toEqual(['second', 'first', null]);
    const c = saved.media[2].url;

    // With altTexts: the final order (kept, then new); one photo dropped.
    req = request(app).put(`/drafts/${draft.id}`).set(auth(me)).field('content', 'later')
      .field('keepMedia', JSON.stringify([c, a])).field('altTexts', JSON.stringify(['third', '', 'fourth']));
    saved = (await withPhotos(req, 1)).body;
    expect(alts(saved.media)).toEqual(['third', null, 'fourth']);
    // An over-long one is refused here too.
    const refused = await request(app).put(`/drafts/${draft.id}`).set(auth(me)).field('content', 'later').field('altTexts', JSON.stringify(['y'.repeat(1001)]));
    expect(refused.status).toBe(400);

    const published = await request(app).post(`/drafts/${draft.id}/publish`).set(auth(me));
    expect(published.status).toBe(201);
    expect(alts(published.body.media)).toEqual(['third', null, 'fourth']);
    expect(alts((await request(app).get(`/posts/${published.body.id}`).set(auth(me))).body.media)).toEqual(['third', null, 'fourth']);
  });

  it('a draft saved before Day 95 (no descriptions) still works', async () => {
    const me = await registerAndLogin(app);
    const draft = (await withPhotos(request(app).post('/drafts').set(auth(me)).field('content', 'old'), 2)).body;
    await pool.query("UPDATE post_drafts SET media_alts = '{}' WHERE id = $1", [draft.id]);
    expect(alts((await request(app).get(`/drafts/${draft.id}`).set(auth(me))).body.media)).toEqual([null, null]);
    expect(alts((await request(app).post(`/drafts/${draft.id}/publish`).set(auth(me))).body.media)).toEqual([null, null]);
  });

  it('is in your data export', async () => {
    const me = await registerAndLogin(app);
    await postWith(me, 1, { altTexts: JSON.stringify(['A red kite']) });
    const data = (await request(app).get('/profile/export').set(auth(me))).body;
    expect(data.posts[0].photo_descriptions).toEqual(['A red kite']);
  });
});
