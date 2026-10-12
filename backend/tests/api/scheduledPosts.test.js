const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 45 step 2: scheduled posts -- a draft with a time, published by
// services/scheduledPostService under the checks of that moment.
describe('scheduled posts (Day 45)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const scheduler = require('../../services/scheduledPostService');
  const ticker = require('../../services/ticker');
  const postCreation = require('../../services/postCreationService');
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const inMinutes = (m) => new Date(Date.now() + m * 60 * 1000).toISOString();
  const form = (req, fields = {}, images = 0) => {
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    for (let i = 0; i < images; i += 1) req = req.attach('images', png, { filename: `${i}.png`, contentType: 'image/png' });
    return req;
  };
  const saveDraft = (user, fields, images) => form(request(app).post('/drafts').set(auth(user)), fields, images);
  const putDraft = (user, id, fields) => form(request(app).put(`/drafts/${id}`).set(auth(user)), fields);
  const reschedule = (user, id, scheduledFor) => request(app).put(`/drafts/${id}/schedule`).set(auth(user)).send({ scheduledFor });
  // The time has come (the scheduler only looks at scheduled_for).
  const makeDue = (id) => pool.query("UPDATE post_drafts SET scheduled_for = now() - interval '1 second' WHERE id = $1", [id]);
  const count = async (table) => (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
  const notificationsOf = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications;

  describe('scheduling', () => {
    it('takes a time 5 minutes to 30 days ahead, and gives it back', async () => {
      const me = await registerAndLogin(app);
      const when = inMinutes(60);
      const res = await saveDraft(me, { content: 'later', scheduledFor: when });
      expect(res.status).toBe(201);
      expect(new Date(res.body.scheduled_for).toISOString()).toBe(when);
      expect(new Date((await request(app).get('/drafts').set(auth(me))).body[0].scheduled_for).toISOString()).toBe(when);

      const cases = [
        [inMinutes(2), 'Pick a time at least 5 minutes from now'],
        [inMinutes(-10), 'Pick a time at least 5 minutes from now'],
        [inMinutes(31 * 24 * 60), 'You can schedule a post up to 30 days ahead'],
        ['tomorrow-ish', 'Invalid scheduledFor']
      ];
      for (const [scheduledFor, message] of cases) {
        const bad = await saveDraft(me, { content: 'x', scheduledFor });
        expect([bad.status, bad.text]).toEqual([400, message]);
      }
      expect((await saveDraft(me, { content: 'ok', scheduledFor: inMinutes(30 * 24 * 60 - 1) })).status).toBe(201);
      expect((await saveDraft(me, { content: 'plain', scheduledFor: '' })).body.scheduled_for).toBeNull();
    });

    it('a scheduled post must be one that could go up now', async () => {
      const me = await registerAndLogin(app);
      const noQuestion = await saveDraft(me, { poll: JSON.stringify({ options: ['a', 'b'] }), scheduledFor: inMinutes(60) });
      expect([noQuestion.status, noQuestion.text]).toEqual([400, 'Post content cannot be empty']);
      // As a plain draft it's fine -- and can't be scheduled until fixed.
      const draft = (await saveDraft(me, { poll: JSON.stringify({ options: ['a', 'b'] }) })).body;
      expect((await reschedule(me, draft.id, inMinutes(60))).text).toBe('Post content cannot be empty');
      expect(await count('post_drafts')).toBe(1);
    });

    it('editing keeps the time unless told otherwise; the list can reschedule or unschedule', async () => {
      const me = await registerAndLogin(app);
      const when = inMinutes(90);
      const draft = (await saveDraft(me, { content: 'v1', scheduledFor: when })).body;
      const edited = await putDraft(me, draft.id, { content: 'v2' });
      expect(new Date(edited.body.scheduled_for).toISOString()).toBe(when);
      // An edit that makes it unpublishable is refused while it's scheduled.
      const noQuestion = await putDraft(me, draft.id, { content: '', poll: JSON.stringify({ options: ['a', 'b'] }) });
      expect([noQuestion.status, noQuestion.text]).toEqual([400, 'Post content cannot be empty']);
      expect((await putDraft(me, draft.id, { content: 'v3', scheduledFor: '' })).body.scheduled_for).toBeNull();

      const later = inMinutes(24 * 60);
      expect(new Date((await reschedule(me, draft.id, later)).body.scheduled_for).toISOString()).toBe(later);
      expect((await reschedule(me, draft.id, null)).body.scheduled_for).toBeNull();
      expect((await reschedule(me, draft.id, inMinutes(1))).status).toBe(400);
      expect((await request(app).put(`/drafts/${draft.id}/schedule`).set(auth(me)).send({})).text).toBe('Invalid scheduledFor');
      const other = await registerAndLogin(app);
      expect((await reschedule(other, draft.id, later)).status).toBe(404);
    });
  });

  describe('publishing on time', () => {
    it('publishes what is due -- photos, hashtags, the author told -- and leaves the rest', async () => {
      const me = await registerAndLogin(app);
      const due = (await saveDraft(me, { content: 'Good morning #sunrise', scheduledFor: inMinutes(60) }, 2)).body;
      const notYet = (await saveDraft(me, { content: 'tonight', scheduledFor: inMinutes(600) })).body;
      const plain = (await saveDraft(me, { content: 'just a draft' })).body;
      await makeDue(due.id);

      expect(await scheduler.publishDue()).toEqual({ published: 1, failed: 0 });
      const post = (await pool.query('SELECT * FROM posts')).rows[0];
      expect(post).toMatchObject({ user_id: me.id, content: 'Good morning #sunrise' });
      expect((await pool.query('SELECT url FROM post_media WHERE post_id = $1 ORDER BY position', [post.id])).rows.map((r) => r.url))
        .toEqual(due.media.map((m) => m.url));
      expect((await request(app).get('/hashtags/sunrise/posts').set(auth(me))).body.posts.map((p) => p.id)).toEqual([post.id]);
      expect((await request(app).get('/drafts').set(auth(me))).body.map((d) => d.id).sort()).toEqual([notYet.id, plain.id].sort());

      const [note] = await notificationsOf(me);
      expect(note).toMatchObject({ type: 'scheduled_post', post_id: post.id, actor_id: me.id, post_content: 'Good morning #sunrise' });
      // Nothing more is due.
      expect(await scheduler.publishDue()).toEqual({ published: 0, failed: 0 });
    });

    it("can't post there any more: back to drafts, with the reason, and the author told", async () => {
      const owner = await registerAndLogin(app);
      const me = await registerAndLogin(app);
      const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Hikers', privacy: 'public' })).body;
      await request(app).post(`/communities/${group.id}/join`).set(auth(me));
      const draft = (await saveDraft(me, { content: 'Trail report', communityId: String(group.id), scheduledFor: inMinutes(60) })).body;
      // Removed from the group before the time comes.
      expect((await request(app).delete(`/communities/${group.id}/members/${me.id}`).set(auth(owner))).status).toBe(200);
      await makeDue(draft.id);

      expect(await scheduler.publishDue()).toEqual({ published: 0, failed: 1 });
      expect(await count('posts')).toBe(0);
      const [back] = (await request(app).get('/drafts').set(auth(me))).body;
      expect(back).toMatchObject({ id: draft.id, scheduled_for: null, last_error: 'Join this group to post in it' });
      expect((await notificationsOf(me))[0]).toMatchObject({ type: 'scheduled_failed', post_id: null, actor_id: me.id });
      // Editing it clears the reason.
      expect((await putDraft(me, draft.id, { content: 'Trail report' })).body.last_error).toBeNull();
    });

    it('a banned, suspended or deactivated author gets nothing published', async () => {
      for (const sql of [
        'UPDATE users SET banned_at = now() WHERE id = $1',
        "UPDATE users SET banned_at = now(), banned_until = now() + interval '3 days' WHERE id = $1",
        'UPDATE users SET is_deactivated = true, deactivated_at = now() WHERE id = $1'
      ]) {
        const me = await registerAndLogin(app);
        const draft = (await saveDraft(me, { content: 'hello', scheduledFor: inMinutes(60) })).body;
        await makeDue(draft.id);
        await pool.query(sql, [me.id]);
        expect(await scheduler.publishDue()).toEqual({ published: 0, failed: 1 });
        const row = (await pool.query('SELECT scheduled_for, last_error FROM post_drafts WHERE id = $1', [draft.id])).rows[0];
        expect(row).toEqual({ scheduled_for: null, last_error: "Your account can't post right now" });
      }
      expect(await count('posts')).toBe(0);
      // A suspension that is over doesn't count.
      const back = await registerAndLogin(app);
      const draft = (await saveDraft(back, { content: 'I am back', scheduledFor: inMinutes(60) })).body;
      await makeDue(draft.id);
      await pool.query("UPDATE users SET banned_at = now() - interval '4 days', banned_until = now() - interval '1 day' WHERE id = $1", [back.id]);
      expect(await scheduler.publishDue()).toEqual({ published: 1, failed: 0 });
    });

    it('two runs at the same moment publish each post once', async () => {
      const me = await registerAndLogin(app);
      for (let i = 0; i < 4; i += 1) {
        const draft = (await saveDraft(me, { content: `post ${i}`, scheduledFor: inMinutes(60) })).body;
        await makeDue(draft.id);
      }
      const runs = await Promise.all([scheduler.publishDue(), scheduler.publishDue(), scheduler.publishDue()]);
      expect(runs.reduce((n, r) => n + r.published, 0)).toBe(4);
      expect((await pool.query('SELECT content FROM posts ORDER BY content')).rows.map((r) => r.content)).toEqual(['post 0', 'post 1', 'post 2', 'post 3']);
      expect(await count('post_drafts')).toBe(0);
      expect((await notificationsOf(me)).filter((n) => n.type === 'scheduled_post')).toHaveLength(4);
    });

    it('stops at the per-run limit; the rest go next time', async () => {
      const me = await registerAndLogin(app);
      for (let i = 0; i < 3; i += 1) await makeDue((await saveDraft(me, { content: `p${i}`, scheduledFor: inMinutes(60) })).body.id);
      expect(await scheduler.publishDue({ limit: 2 })).toEqual({ published: 2, failed: 0 });
      expect(await scheduler.countDue()).toBe(1);
      expect(await scheduler.publishDue()).toEqual({ published: 1, failed: 0 });
    });

    it('an unexpected error keeps the draft due, to be tried again', async () => {
      const me = await registerAndLogin(app);
      const draft = (await saveDraft(me, { content: 'try again', scheduledFor: inMinutes(60) })).body;
      await makeDue(draft.id);
      const spy = jest.spyOn(postCreation, 'insertPost').mockRejectedValueOnce(new Error('connection lost'));
      try {
        await expect(scheduler.publishDue()).rejects.toThrow('connection lost');
      } finally {
        spy.mockRestore();
      }
      expect(await count('posts')).toBe(0);
      expect(await scheduler.countDue()).toBe(1);
      expect((await pool.query('SELECT last_error FROM post_drafts')).rows[0].last_error).toBeNull();
      expect(await scheduler.publishDue()).toEqual({ published: 1, failed: 0 });
    });

    it('the ticker runs one pass at a time and survives a failing pass', async () => {
      const me = await registerAndLogin(app);
      await makeDue((await saveDraft(me, { content: 'tick', scheduledFor: inMinutes(60) })).body.id);
      const spy = jest.spyOn(postCreation, 'insertPost').mockRejectedValueOnce(new Error('boom'));
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await ticker.tick(); // logged, not thrown
        expect(logged).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        logged.mockRestore();
      }
      // A tick while one is running does nothing: one pass = a connection
      // for the post, one finding no more posts, one finding no ended poll,
      // one finding no event reminder due (Day 55).
      const connect = jest.spyOn(require('../../db'), 'connect');
      try {
        await Promise.all([ticker.tick(), ticker.tick()]);
        expect(connect).toHaveBeenCalledTimes(4);
      } finally {
        connect.mockRestore();
      }
      expect(await count('posts')).toBe(1);
    });

    it('the daily cleanup publishes what is due too (and its dry run counts it)', async () => {
      const cleanup = require('../../services/cleanupService');
      const me = await registerAndLogin(app);
      await makeDue((await saveDraft(me, { content: 'backstop', scheduledFor: inMinutes(60) })).body.id);
      expect((await cleanup.run({ dryRun: true })).scheduledPostsDue).toBe(1);
      expect(await count('posts')).toBe(0);
      expect(await cleanup.run()).toMatchObject({ scheduledPostsPublished: 1, scheduledPostsFailed: 0 });
      expect(await count('posts')).toBe(1);
    });
  });

  it('push text for both, in English and Arabic', () => {
    const { pushText } = require('../../config/pushText');
    expect(pushText('en', 'scheduled_post', {})).toBe('Your scheduled post was published');
    expect(pushText('ar', 'scheduled_post', {})).toBe('نُشر منشورك المجدول');
    expect(pushText('ar', 'scheduled_failed', {})).toBe('تعذّر نشر منشورك المجدول. أُعيد إلى مسوداتك.');
  });
});
