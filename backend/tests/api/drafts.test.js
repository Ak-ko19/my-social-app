const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 45: drafts (migration 052) -- private to their author, published
// through the same checks as a post.
describe('drafts (Day 45)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const form = (req, fields = {}, images = 0) => {
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    for (let i = 0; i < images; i += 1) req = req.attach('images', png, { filename: `${i}.png`, contentType: 'image/png' });
    return req;
  };
  const saveDraft = (user, fields, images) => form(request(app).post('/drafts').set(auth(user)), fields, images);
  const putDraft = (user, id, fields, images) => form(request(app).put(`/drafts/${id}`).set(auth(user)), fields, images);
  const drafts = async (user) => (await request(app).get('/drafts').set(auth(user))).body;
  const count = async (table) => (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
  // Turns on media cleanup (off in tests unless Cloudinary is configured)
  // and returns the public ids deleted while `work` runs.
  const deletedDuring = async (work) => {
    const cloudinary = require('../../config/cloudinary');
    const env = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
    const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
      cloudinary.api.delete_resources.mockClear();
      await work();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return cloudinary.api.delete_resources.mock.calls.flatMap(([batch]) => batch);
    } finally {
      Object.assign(process.env, saved);
    }
  };

  it('saves, lists and opens your drafts -- text, photos or a poll', async () => {
    const me = await registerAndLogin(app);
    const text = await saveDraft(me, { content: 'Half a thought', visibility: 'followers' });
    expect(text.status).toBe(201);
    expect(text.body).toMatchObject({ content: 'Half a thought', visibility: 'followers', media: [], poll: null, scheduled_for: null });
    const photos = await saveDraft(me, {}, 2);
    expect(photos.status).toBe(201);
    expect(photos.body.media).toHaveLength(2);
    const poll = await saveDraft(me, { poll: JSON.stringify({ options: ['Tea', 'Coffee'], durationHours: 72 }) });
    expect(poll.body.poll).toEqual({ options: ['Tea', 'Coffee'], durationHours: 72 });

    expect((await drafts(me)).map((d) => d.id)).toEqual([poll.body.id, photos.body.id, text.body.id]);
    expect((await request(app).get(`/drafts/${text.body.id}`).set(auth(me))).body.content).toBe('Half a thought');
    // Nothing was posted.
    expect(await count('posts')).toBe(0);
  });

  it('refuses an empty draft, photos with a poll, and more than 50 drafts', async () => {
    const me = await registerAndLogin(app);
    expect((await saveDraft(me, { content: '   ' })).text).toBe('A draft needs text, a photo or a poll');
    expect((await saveDraft(me, { poll: JSON.stringify({ options: ['a', 'b'] }) }, 1)).text).toBe("A poll can't have photos");
    expect((await saveDraft(me, { poll: JSON.stringify({ options: ['a'] }) })).text).toBe('A poll needs 2 to 4 options');
    expect((await saveDraft(me, { content: 'x'.repeat(10001) })).status).toBe(400);
    await pool.query("INSERT INTO post_drafts (user_id, content) SELECT $1, 'd' || g FROM generate_series(1, 50) g", [me.id]);
    expect((await saveDraft(me, { content: 'one more' })).text).toBe('You can keep up to 50 drafts');
  });

  it('stores Zawgyi as Unicode, like a post', async () => {
    const me = await registerAndLogin(app);
    expect((await saveDraft(me, { content: 'ေမာင္ေမာင္ ေနေကာင္းလား' })).body.content).toBe('မောင်မောင် နေကောင်းလား');
  });

  it("someone else's draft is not found", async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const draft = (await saveDraft(me, { content: 'mine' })).body;
    expect((await request(app).get(`/drafts/${draft.id}`).set(auth(other))).status).toBe(404);
    expect((await putDraft(other, draft.id, { content: 'theirs' })).status).toBe(404);
    expect((await request(app).delete(`/drafts/${draft.id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).post(`/drafts/${draft.id}/publish`).set(auth(other))).status).toBe(404);
    expect(await drafts(other)).toEqual([]);
    expect((await request(app).get('/drafts/abc').set(auth(me))).status).toBe(400);
    expect((await request(app).get('/drafts')).status).toBe(401);
    expect((await request(app).get(`/drafts/${draft.id}`).set(auth(me))).body.content).toBe('mine');
  });

  it('editing keeps the chosen photos in order, adds new ones, deletes the rest', async () => {
    const me = await registerAndLogin(app);
    const draft = (await saveDraft(me, { content: 'trip' }, 3)).body;
    const [a, b, c] = draft.media.map((m) => m.url);
    let res;
    const deleted = await deletedDuring(async () => {
      res = await putDraft(me, draft.id, { content: 'trip, edited', keepMedia: JSON.stringify([c, a]) }, 1);
    });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('trip, edited');
    expect(res.body.media.map((m) => m.url).slice(0, 2)).toEqual([c, a]);
    expect(res.body.media).toHaveLength(3);
    expect(deleted).toEqual([b.match(/(posts\/img\d+)/)[1]]);
    // Without keepMedia every photo stays; a URL that isn't the draft's is ignored.
    const again = await putDraft(me, draft.id, { content: 'x', keepMedia: JSON.stringify([c, 'https://evil.example/x.jpg']) });
    expect(again.body.media.map((m) => m.url)).toEqual([c]);
    expect((await putDraft(me, draft.id, { content: 'y' })).body.media.map((m) => m.url)).toEqual([c]);
    expect((await putDraft(me, draft.id, { content: '', keepMedia: '[]' })).text).toBe('A draft needs text, a photo or a poll');
    expect((await putDraft(me, draft.id, { content: 'z', keepMedia: 'nope' })).text).toBe('Invalid keepMedia');
  });

  it('deleting a draft deletes its photos', async () => {
    const me = await registerAndLogin(app);
    const draft = (await saveDraft(me, { content: 'bye' }, 1)).body;
    const deleted = await deletedDuring(async () => {
      expect((await request(app).delete(`/drafts/${draft.id}`).set(auth(me))).status).toBe(200);
    });
    expect(deleted).toHaveLength(1);
    expect(await count('post_drafts')).toBe(0);
    expect((await request(app).delete(`/drafts/${draft.id}`).set(auth(me))).status).toBe(404);
  });

  it('publishing makes it a post (photos, poll, hashtags, mentions) and removes the draft', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const photo = (await saveDraft(me, { content: `Sunset #yangon @${friend.username}` }, 2)).body;
    const res = await request(app).post(`/drafts/${photo.id}/publish`).set(auth(me));
    expect(res.status).toBe(201);
    expect(res.body.content).toBe(`Sunset #yangon @${friend.username}`);
    expect(res.body.media.map((m) => m.url)).toEqual(photo.media.map((m) => m.url));
    expect(await drafts(me)).toEqual([]);
    const feed = (await request(app).get('/feed').set(auth(me))).body.posts;
    expect(feed[0]).toMatchObject({ id: res.body.id, media: photo.media });
    expect((await request(app).get('/hashtags/yangon/posts').set(auth(me))).body.posts.map((p) => p.id)).toEqual([res.body.id]);
    const notes = (await request(app).get('/notifications').set(auth(friend))).body.notifications;
    expect(notes.map((n) => n.type)).toEqual(['mention']);

    const poll = (await saveDraft(me, { content: 'Tea?', poll: JSON.stringify({ options: ['Yes', 'No'] }) })).body;
    const pollPost = await request(app).post(`/drafts/${poll.id}/publish`).set(auth(me));
    expect(pollPost.body.poll.options.map((o) => o.label)).toEqual(['Yes', 'No']);
    // Publishing twice: the draft is gone.
    expect((await request(app).post(`/drafts/${poll.id}/publish`).set(auth(me))).status).toBe(404);
  });

  it("can't publish what a post couldn't be, and keeps the draft", async () => {
    const me = await registerAndLogin(app);
    const noQuestion = (await saveDraft(me, { poll: JSON.stringify({ options: ['a', 'b'] }) })).body;
    const res = await request(app).post(`/drafts/${noQuestion.id}/publish`).set(auth(me));
    expect([res.status, res.text]).toEqual([400, 'Post content cannot be empty']);
    expect((await drafts(me)).map((d) => d.id)).toEqual([noQuestion.id]);
    expect(await count('posts')).toBe(0);
  });

  it('a group draft: only for members, and checked again when published', async () => {
    const owner = await registerAndLogin(app);
    const me = await registerAndLogin(app);
    const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Hikers' })).body;
    expect((await saveDraft(me, { content: 'hi', communityId: String(group.id) })).status).toBe(403);
    await request(app).post(`/communities/${group.id}/join`).set(auth(me));
    const draft = (await saveDraft(me, { content: 'hi', communityId: String(group.id) })).body;
    expect(draft).toMatchObject({ community_id: group.id, community_name: 'Hikers' });
    await request(app).delete(`/communities/${group.id}/members/${me.id}`).set(auth(me));
    const res = await request(app).post(`/drafts/${draft.id}/publish`).set(auth(me));
    expect([res.status, res.text]).toEqual([403, 'Join this group to post in it']);
    expect(await drafts(me)).toHaveLength(1);
  });

  it('a page draft is only for its owner', async () => {
    const owner = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Tea Shop' })).body;
    expect((await saveDraft(other, { content: 'hi', pageId: String(page.id) })).status).toBe(403);
    const draft = (await saveDraft(owner, { content: 'hi', pageId: String(page.id) })).body;
    expect(draft.page_name).toBe('Tea Shop');
    expect((await request(app).post(`/drafts/${draft.id}/publish`).set(auth(owner))).body.page_id).toBe(page.id);
  });

  it("draft photos count as used, and go with the account, group or page", async () => {
    const me = await registerAndLogin(app);
    const draft = (await saveDraft(me, { content: 'keep' }, 1)).body;
    const { referencedKeys } = require('../../scripts/cloudinary-orphans');
    const keys = await referencedKeys(require('../../db'), 'test');
    expect(keys.has(`image:${draft.media[0].url.match(/(posts\/img\d+)/)[1]}`)).toBe(true);

    // A group's drafts go with it -- here, its last member leaving.
    const group = (await request(app).post('/communities').set(auth(me)).send({ name: 'Solo' })).body;
    await saveDraft(me, { content: 'group draft', communityId: String(group.id) }, 1);
    const groupDeleted = await deletedDuring(() => request(app).delete(`/communities/${group.id}/members/${me.id}`).set(auth(me)));
    expect(groupDeleted).toHaveLength(1);
    const page = (await request(app).post('/pages').set(auth(me)).send({ name: 'Shop' })).body;
    await saveDraft(me, { content: 'page draft', pageId: String(page.id) }, 1);
    const pageDeleted = await deletedDuring(() => request(app).delete(`/pages/${page.id}`).set(auth(me)));
    expect(pageDeleted).toHaveLength(1);
    expect((await drafts(me)).map((d) => d.content)).toEqual(['keep']);

    const accountDeleted = await deletedDuring(() => request(app).delete('/profile').set(auth(me)).send({ password: me.password }));
    expect(accountDeleted).toContain(draft.media[0].url.match(/(posts\/img\d+)/)[1]);
    expect(await count('post_drafts')).toBe(0);
  });

  it('the data download lists your drafts', async () => {
    const me = await registerAndLogin(app);
    await saveDraft(me, { content: 'for later' });
    const data = (await request(app).get('/profile/export').set(auth(me))).body;
    expect(data.drafts_and_scheduled_posts).toEqual([expect.objectContaining({ content: 'for later', scheduled_for: null, media: [] })]);
  });

  it('publishing twice at the same moment makes one post', async () => {
    const me = await registerAndLogin(app);
    const draft = (await saveDraft(me, { content: 'only once' }, 1)).body;
    const results = await Promise.all([1, 2, 3].map(() => request(app).post(`/drafts/${draft.id}/publish`).set(auth(me))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 404, 404]);
    expect(await count('posts')).toBe(1);
    expect(await count('post_media')).toBe(1);
  });

  it('a photo listed twice in keepMedia is kept once', async () => {
    const me = await registerAndLogin(app);
    const draft = (await saveDraft(me, { content: 'dup' }, 2)).body;
    const [a, b] = draft.media.map((m) => m.url);
    const res = await putDraft(me, draft.id, { content: 'dup', keepMedia: JSON.stringify([b, a, b, a]) });
    expect(res.body.media.map((m) => m.url)).toEqual([b, a]);
  });

  it('needs a login; a malformed id is 400', async () => {
    expect((await request(app).get('/drafts')).status).toBe(401);
    expect((await request(app).post('/drafts').field('content', 'x')).status).toBe(401);
    const me = await registerAndLogin(app);
    for (const bad of ['abc', '1.5', '-1']) {
      expect((await request(app).get(`/drafts/${bad}`).set(auth(me))).status).toBe(400);
      expect((await request(app).post(`/drafts/${bad}/publish`).set(auth(me))).status).toBe(400);
    }
  });

  // A group or page id of 0 is a number like any other: refused because
  // you're not in that group / don't own that page (it used to be skipped
  // as "no group" and then fail on the foreign key).
  it('group or page 0 is refused like any group or page that is not yours', async () => {
    const me = await registerAndLogin(app);
    for (const send of [saveDraft, (u, f) => form(request(app).post('/posts').set(auth(u)), f)]) {
      const group = await send(me, { content: 'x', communityId: '0' });
      expect([group.status, group.text]).toEqual([403, 'Join this group to post in it']);
      const page = await send(me, { content: 'x', pageId: '0' });
      expect([page.status, page.text]).toEqual([403, 'Only the page owner can post as this page']);
      const onlyMe = await send(me, { content: 'x', communityId: '0', visibility: 'only_me' });
      expect(onlyMe.status).toBe(400);
    }
    expect(await count('posts') + await count('post_drafts')).toBe(0);
  });
});
