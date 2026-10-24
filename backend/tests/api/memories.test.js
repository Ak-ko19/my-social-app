const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Days 83-84: Memories -- your own posts from this day in earlier years,
// in your own time zone.
describe('memories (Days 83-84)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const memories = (user, query) => request(app).get('/memories').query(query).set(auth(user));
  // A post, then moved back in time (posts can't be made in the past).
  async function postAt(user, content, at, fields = {}) {
    let req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const post = (await req).body;
    // created_at holds the database's local time (see memoryController).
    await pool.query("UPDATE posts SET created_at = $2::timestamptz AT TIME ZONE current_setting('TimeZone') WHERE id = $1", [post.id, at]);
    return post;
  }
  const contents = (body) => body.memories.map((m) => [m.yearsAgo, m.year, m.posts.map((p) => p.content)]);

  it('your posts from this date in earlier years, newest year first', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    await postAt(me, 'one year ago', '2025-10-25T09:00:00Z');
    await postAt(me, 'one year ago, later', '2025-10-25T18:00:00Z');
    await postAt(me, 'three years ago', '2023-10-25T12:00:00Z');
    await postAt(me, 'another day', '2025-10-26T12:00:00Z');
    await postAt(me, 'this year', '2026-10-25T08:00:00Z');
    await postAt(other, 'not mine', '2025-10-25T12:00:00Z');
    const res = await memories(me, { tz: 'UTC', date: '2026-10-25' });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-10-25');
    expect(contents(res.body)).toEqual([
      [1, 2025, ['one year ago, later', 'one year ago']],
      [3, 2023, ['three years ago']]
    ]);
  });

  it("reads each post's date in your time zone", async () => {
    const me = await registerAndLogin(app);
    // 22:30 UTC on the 24th is already the 25th in Tokyo (UTC+9).
    await postAt(me, 'late night', '2025-10-24T22:30:00Z');
    expect(contents((await memories(me, { tz: 'Asia/Tokyo', date: '2026-10-25' })).body)).toEqual([[1, 2025, ['late night']]]);
    expect((await memories(me, { tz: 'UTC', date: '2026-10-25' })).body.memories).toEqual([]);
    expect(contents((await memories(me, { tz: 'UTC', date: '2026-10-24' })).body)).toEqual([[1, 2025, ['late night']]]);
  });

  it('a Feb 29 post comes back on Feb 28 in years without one', async () => {
    const me = await registerAndLogin(app);
    await postAt(me, 'leap day', '2024-02-29T12:00:00Z');
    expect(contents((await memories(me, { tz: 'UTC', date: '2025-02-28' })).body)).toEqual([[1, 2024, ['leap day']]]);
    expect((await memories(me, { tz: 'UTC', date: '2028-02-28' })).body.memories).toEqual([]);
    expect(contents((await memories(me, { tz: 'UTC', date: '2028-02-29' })).body)).toEqual([[4, 2024, ['leap day']]]);
  });

  it('only profile posts, whatever their audience, with the full post (polls too)', async () => {
    const me = await registerAndLogin(app);
    const group = (await request(app).post('/communities').set(auth(me)).send({ name: 'Club' })).body;
    const page = (await request(app).post('/pages').set(auth(me)).send({ name: 'Shop' })).body;
    await postAt(me, 'in a group', '2025-10-25T12:00:00Z', { communityId: String(group.id) });
    await postAt(me, 'as a page', '2025-10-25T12:00:00Z', { pageId: String(page.id) });
    await postAt(me, 'only me', '2025-10-25T12:00:00Z', { visibility: 'only_me' });
    const poll = await postAt(me, 'which?', '2025-10-25T13:00:00Z', { poll: JSON.stringify({ options: ['a', 'b'] }) });
    const res = await memories(me, { tz: 'UTC', date: '2026-10-25' });
    expect(contents(res.body)).toEqual([[1, 2025, ['which?', 'only me']]]);
    const [withPoll] = res.body.memories[0].posts;
    expect(poll.poll).toBeTruthy();
    expect(withPoll.poll.options.map((o) => o.label)).toEqual(['a', 'b']);
    expect(withPoll).toMatchObject({ user_id: me.id, username: me.username, like_count: 0, liked_by_me: false });
  });

  it("today is your own date when none is sent", async () => {
    const me = await registerAndLogin(app);
    const res = await memories(me, { tz: 'Pacific/Kiritimati' });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date());
    expect(res.body.date).toBe(today);
  });

  it('refuses a made-up zone or date, and needs a login', async () => {
    const me = await registerAndLogin(app);
    expect((await memories(me, { tz: 'Mars/Olympus' })).status).toBe(400);
    expect((await memories(me, { tz: 'UTC', date: '2025-02-30' })).status).toBe(400);
    expect((await memories(me, { tz: 'UTC', date: 'yesterday' })).status).toBe(400);
    expect((await request(app).get('/memories')).status).toBe(401);
  });
});
