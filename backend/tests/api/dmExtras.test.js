const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B9 DM extras: edit, reply-to, image messages (+ the delete-scrub audit fix).
describe('DM extras (B9)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  let a;
  let b;
  let conv;

  const send = (user, content, extra = {}) =>
    request(app).post(`/conversations/${conv.id}/messages`).set(auth(user)).send({ content, ...extra });
  const history = async (user) =>
    (await request(app).get(`/conversations/${conv.id}/messages`).set(auth(user))).body.messages;
  const edit = (user, messageId, content) =>
    request(app).put(`/conversations/${conv.id}/messages/${messageId}`).set(auth(user)).send({ content });
  const ageMessage = async (id, minutes) => {
    const { pool } = require('../helpers/testDb');
    await pool.query(`UPDATE messages SET created_at = now() - ($2 || ' minutes')::interval WHERE id = $1`, [id, String(minutes)]);
  };

  beforeEach(async () => {
    a = await registerAndLogin(app);
    b = await registerAndLogin(app);
    conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
  });

  describe('edit', () => {
    it('edits your own recent text message; history shows it edited', async () => {
      const msg = (await send(a, 'helo')).body;
      const res = await edit(a, msg.id, 'hello <b>there</b>');
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('hello <b>there</b>'); // Day 75: kept as typed, same as sends
      expect(res.body.edited_at).toBeTruthy();
      const row = (await history(b)).find((m) => m.id === msg.id);
      expect(row).toMatchObject({ content: 'hello <b>there</b>' });
      expect(row.edited_at).toBeTruthy();
    });

    it('rejects: someone else\'s (403), deleted (403), older than 15 min (403), empty (400), unknown (404)', async () => {
      const mine = (await send(a, 'mine')).body;
      expect((await edit(b, mine.id, 'hijack')).status).toBe(403);
      expect((await edit(a, mine.id, '   ')).status).toBe(400);
      expect((await edit(a, 999999, 'x')).status).toBe(404);

      await ageMessage(mine.id, 16);
      const late = await edit(a, mine.id, 'too late');
      expect(late.status).toBe(403);
      expect(late.text).toMatch(/15 minutes/);

      const gone = (await send(a, 'to delete')).body;
      await request(app).delete(`/conversations/${conv.id}/messages/${gone.id}`).set(auth(a));
      expect((await edit(a, gone.id, 'resurrect')).status).toBe(403);
    });

    it('only text messages can be edited', async () => {
      const img = (await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(a))
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' })).body;
      const res = await edit(a, img.id, 'caption?');
      expect(res.status).toBe(403);
    });
  });

  describe('reply-to', () => {
    it('stores the reply and returns a preview of the original (send + history)', async () => {
      const original = (await send(b, 'what time tomorrow?')).body;
      const reply = await send(a, '9am', { replyToMessageId: original.id });
      expect(reply.status).toBe(201);
      expect(reply.body.reply_to).toMatchObject({ id: original.id, sender_id: b.id, content: 'what time tomorrow?', deleted: false });

      const row = (await history(b)).find((m) => m.id === reply.body.id);
      expect(row.reply_to).toMatchObject({ id: original.id, content: 'what time tomorrow?' });
      const plain = (await history(b)).find((m) => m.id === original.id);
      expect(plain.reply_to).toBeNull();
    });

    it('rejects replying to a message from another conversation (400)', async () => {
      const c = await registerAndLogin(app);
      const other = (await request(app).post('/conversations').set(auth(a)).send({ userId: c.id })).body;
      const foreign = (await request(app).post(`/conversations/${other.id}/messages`).set(auth(c)).send({ content: 'secret' })).body;
      const res = await send(a, 'quoting', { replyToMessageId: foreign.id });
      expect(res.status).toBe(400);
    });

    it('a reply to a since-deleted message shows it as deleted, without its content', async () => {
      const original = (await send(b, 'oops')).body;
      const reply = (await send(a, 'lol', { replyToMessageId: original.id })).body;
      await request(app).delete(`/conversations/${conv.id}/messages/${original.id}`).set(auth(b));
      const row = (await history(a)).find((m) => m.id === reply.id);
      expect(row.reply_to).toMatchObject({ id: original.id, deleted: true, content: null });
    });
  });

  describe('image messages', () => {
    it('sends an image (with optional caption) that shows in history and the inbox preview', async () => {
      const res = await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(a))
        .field('caption', 'look')
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: 'image', content: 'look' });
      expect(res.body.media_url).toMatch(/^https:\/\/res\.cloudinary\.com\//);

      const row = (await history(b)).find((m) => m.id === res.body.id);
      expect(row.type).toBe('image');
      const inbox = (await request(app).get('/conversations').set(auth(b))).body.conversations;
      expect(inbox.find((c) => c.conversation_id === conv.id).last_message).toBe('Photo: look');
    });

    it('requires a file (400); non-participants are refused before any upload (403)', async () => {
      expect((await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(a))).status).toBe(400);
      const outsider = await registerAndLogin(app);
      const res = await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(outsider))
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' });
      expect(res.status).toBe(403);
    });
  });

  describe('delete scrub (audit fix)', () => {
    it('a deleted voice message no longer exposes its audio URL or duration', async () => {
      const { pool } = require('../helpers/testDb');
      const voice = (await pool.query(
        "INSERT INTO messages (conversation_id, sender_id, type, media_url, duration_seconds) VALUES ($1, $2, 'voice', 'https://res.cloudinary.com/test/v.mp3', 7) RETURNING id",
        [conv.id, a.id]
      )).rows[0];
      const inboxBefore = (await request(app).get('/conversations').set(auth(b))).body.conversations;
      expect(inboxBefore.find((c) => c.conversation_id === conv.id).last_message).toBe('Voice message');

      const del = await request(app).delete(`/conversations/${conv.id}/messages/${voice.id}`).set(auth(a));
      expect(del.status).toBe(200);
      expect(del.body).toMatchObject({ media_url: null, duration_seconds: null });
      const row = (await history(b)).find((m) => m.id === voice.id);
      expect(row).toMatchObject({ media_url: null, duration_seconds: null, content: null });
    });
  });
});
