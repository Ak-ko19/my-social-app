const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 70: message history pages with no gaps or repeats, even when messages
// are only microseconds apart (Postgres keeps microseconds; a JS Date only
// milliseconds, so a cursor that goes through one loses the difference).
describe('message history cursor', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

  it('reads every message once, one per page, across the same millisecond', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    const times = ['10:00:00.122000', '10:00:00.123400', '10:00:00.123500', '10:00:00.123600', '10:00:00.124000'];
    for (const [i, t] of times.entries()) {
      await pool.query(
        "INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4::timestamptz)",
        [conv.id, a.id, `m${i + 1}`, `2026-01-01 ${t}+00`]
      );
    }
    const seen = [];
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const res = await request(app).get(`/conversations/${conv.id}/messages`).query({ limit: 1, ...(cursor && { cursor }) }).set(auth(a));
      expect(res.status).toBe(200);
      seen.unshift(...res.body.messages.map((m) => m.content)); // each page is older than the last
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it("an older cursor (with createdAt) still works; another chat's cursor finds nothing", async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const c = await registerAndLogin(app);
    const mine = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    const other = (await request(app).post('/conversations').set(auth(b)).send({ userId: c.id })).body;
    const send = (user, conv, content) => request(app).post(`/conversations/${conv.id}/messages`).set(auth(user)).send({ content });
    const first = (await send(a, mine, 'one')).body;
    const second = (await send(a, mine, 'two')).body;
    const theirs = (await send(b, other, 'secret')).body;
    const old = Buffer.from(JSON.stringify({ createdAt: second.created_at, id: second.id })).toString('base64');
    const page = await request(app).get(`/conversations/${mine.id}/messages`).query({ cursor: old }).set(auth(a));
    expect(page.body.messages.map((m) => m.id)).toEqual([first.id]);
    const foreign = Buffer.from(JSON.stringify({ id: theirs.id })).toString('base64');
    const none = await request(app).get(`/conversations/${mine.id}/messages`).query({ cursor: foreign }).set(auth(a));
    expect([none.status, none.body.messages]).toEqual([200, []]);
  });

  it('refuses a cursor that is not one it gave out', async () => {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    for (const cursor of ['nonsense', Buffer.from('{"id":"x"}').toString('base64')]) {
      expect((await request(app).get(`/conversations/${conv.id}/messages`).query({ cursor }).set(auth(a))).status).toBe(400);
    }
  });
});
