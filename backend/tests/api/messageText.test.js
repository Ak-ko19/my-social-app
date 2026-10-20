const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 75: a message is kept exactly as typed, like a post or a comment --
// every client shows it as text. (It used to go through an HTML sanitizer
// that ate "x<y and y>z" and stored & < > as entities.)
const TYPED = [
  'Tom & Jerry <3',
  'if x<y and y>z then',
  'use <div> for layout, not <table>',
  '<script>alert(1)</script>hello',
  'مرحبا <b>بك</b> & မင်္ဂလာပါ'
];

describe('message text is kept as typed', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  let a;
  let conv;
  beforeEach(async () => {
    a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
  });

  it('when sent, when read back, and when edited', async () => {
    for (const text of TYPED) {
      const sent = await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: `  ${text}  ` });
      expect(sent.status).toBe(201);
      expect(sent.body.content).toBe(text);
    }
    const history = (await request(app).get(`/conversations/${conv.id}/messages`).set(auth(a))).body.messages;
    expect(history.map((m) => m.content)).toEqual(TYPED);

    const edited = await request(app).put(`/conversations/${conv.id}/messages/${history[0].id}`).set(auth(a)).send({ content: 'R&D <team>' });
    expect(edited.status).toBe(200);
    expect(edited.body.content).toBe('R&D <team>');
  });

  it("as a photo's caption", async () => {
    const res = await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(a))
      .attach('image', Buffer.from('ffd8ffe0', 'hex'), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .field('caption', 'Before & after <3');
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Before & after <3');
  });

  it('refuses content that is not text, or only spaces', async () => {
    for (const content of [{ toString: 'x' }, ['a'], 42, '   ']) {
      const res = await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content });
      expect([JSON.stringify(content), res.status, res.text]).toEqual([JSON.stringify(content), 400, 'Message content cannot be empty']);
    }
  });

  it('migration 071 turns the old entities back into what was typed', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../migrations/071_message_text_as_typed.up.sql'), 'utf8');
    const insert = async (content) => (await pool.query(
      "INSERT INTO messages (conversation_id, sender_id, type, content) VALUES ($1, $2, 'text', $3) RETURNING id", [conv.id, a.id, content]
    )).rows[0].id;
    const ids = [];
    for (const old of ['Tom &amp; Jerry &lt;3', 'a &gt; b', 'typed &amp;lt; itself', 'no entities here', 'مرحبا &amp; سلام']) ids.push(await insert(old));
    const report = (await pool.query(
      "INSERT INTO reports (reporter_id, target_type, target_id, reason, target_snapshot) VALUES ($1, 'message', $2, 'spam', 'Tom &amp; Jerry &lt;3') RETURNING id",
      [a.id, ids[0]]
    )).rows[0].id;

    await pool.query(sql);
    const rows = (await pool.query('SELECT content FROM messages WHERE id = ANY($1) ORDER BY id', [ids])).rows.map((r) => r.content);
    expect(rows).toEqual(['Tom & Jerry <3', 'a > b', 'typed &lt; itself', 'no entities here', 'مرحبا & سلام']);
    expect((await pool.query('SELECT target_snapshot FROM reports WHERE id = $1', [report])).rows[0].target_snapshot).toBe('Tom & Jerry <3');
  });
});
