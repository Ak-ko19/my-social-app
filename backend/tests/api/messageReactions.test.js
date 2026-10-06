const http = require('http');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 31: react to a message (one reaction per person, the six post
// reactions), live for everyone in the chat.
describe('message reactions (Day 31)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const react = (user, convId, msgId, reaction) =>
    request(app).put(`/conversations/${convId}/messages/${msgId}/reaction`).set(auth(user)).send({ reaction });
  const unreact = (user, convId, msgId) => request(app).delete(`/conversations/${convId}/messages/${msgId}/reaction`).set(auth(user));
  const messagesOf = async (user, convId) => (await request(app).get(`/conversations/${convId}/messages`).set(auth(user))).body.messages;

  async function chat() {
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
    const msg = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'hello' })).body;
    return { a, b, conv, msg };
  }

  it('reacts, changes the reaction, and removes it; the messages list carries them', async () => {
    const { a, b, conv, msg } = await chat();
    const first = await react(b, conv.id, msg.id, 'love');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ conversationId: conv.id, messageId: msg.id, reactions: [{ user_id: b.id, reaction: 'love' }] });
    await react(a, conv.id, msg.id, 'haha');
    expect((await react(b, conv.id, msg.id, 'wow')).body.reactions).toEqual([{ user_id: a.id, reaction: 'haha' }, { user_id: b.id, reaction: 'wow' }]);
    expect((await messagesOf(a, conv.id))[0].reactions).toEqual([{ user_id: a.id, reaction: 'haha' }, { user_id: b.id, reaction: 'wow' }]);
    const removed = await unreact(b, conv.id, msg.id);
    expect(removed.body.reactions).toEqual([{ user_id: a.id, reaction: 'haha' }]);
    expect((await unreact(b, conv.id, msg.id)).status).toBe(200); // removing twice is harmless
  });

  it('a message without reactions lists an empty array', async () => {
    const { a, conv } = await chat();
    expect((await messagesOf(a, conv.id))[0].reactions).toEqual([]);
  });

  it('refuses an unknown or missing reaction (400) and bad ids (400)', async () => {
    const { a, conv, msg } = await chat();
    expect((await react(a, conv.id, msg.id, 'party')).status).toBe(400);
    expect((await react(a, conv.id, msg.id, undefined)).status).toBe(400);
    expect((await react(a, conv.id, 'abc', 'like')).status).toBe(400);
  });

  it('only people in the chat can react, and only to its own messages', async () => {
    const { a, conv, msg } = await chat();
    const outsider = await registerAndLogin(app);
    expect((await react(outsider, conv.id, msg.id, 'like')).status).toBe(403);
    // A message from another chat, addressed through this one: not found.
    const other = await registerAndLogin(app);
    const conv2 = (await request(app).post('/conversations').set(auth(a)).send({ userId: other.id })).body;
    const msg2 = (await request(app).post(`/conversations/${conv2.id}/messages`).set(auth(a)).send({ content: 'elsewhere' })).body;
    expect((await react(a, conv.id, msg2.id, 'like')).status).toBe(404);
    expect((await react(a, conv.id, 999999, 'like')).status).toBe(404);
  });

  it('no reacting after a block, in either direction', async () => {
    const { a, b, conv, msg } = await chat();
    await request(app).post(`/users/${a.id}/block`).set(auth(b));
    expect((await react(a, conv.id, msg.id, 'like')).status).toBe(403);
    expect((await react(b, conv.id, msg.id, 'like')).status).toBe(403);
  });

  it('unsending a message removes its reactions, and it can\'t get new ones (409)', async () => {
    const { a, b, conv, msg } = await chat();
    await react(b, conv.id, msg.id, 'love');
    await request(app).delete(`/conversations/${conv.id}/messages/${msg.id}`).set(auth(a));
    expect((await messagesOf(b, conv.id))[0].reactions).toEqual([]);
    expect((await react(b, conv.id, msg.id, 'like')).status).toBe(409);
    // Really gone, not just hidden from the list.
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(b))).text);
    expect(data.message_reactions).toEqual([]);
  });

  it('an edit keeps the reactions on the returned message', async () => {
    const { a, b, conv, msg } = await chat();
    await react(b, conv.id, msg.id, 'like');
    const edited = await request(app).put(`/conversations/${conv.id}/messages/${msg.id}`).set(auth(a)).send({ content: 'hello!' });
    expect(edited.body.reactions).toEqual([{ user_id: b.id, reaction: 'like' }]);
  });

  it('the data download lists my message reactions', async () => {
    const { b, conv, msg } = await chat();
    await react(b, conv.id, msg.id, 'sad');
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(b))).text);
    expect(data.message_reactions).toEqual([expect.objectContaining({ conversation_id: conv.id, message_id: msg.id, reaction: 'sad' })]);
  });

  describe('live', () => {
    let server;
    let url;
    beforeAll(async () => {
      const { initSocket } = require('../../sockets');
      server = http.createServer(app);
      initSocket(server);
      await new Promise((resolve) => server.listen(0, resolve));
      url = `http://localhost:${server.address().port}`;
    });
    afterAll(async () => {
      require('../../sockets').getIO().close();
      await new Promise((resolve) => server.close(resolve));
    });

    it('everyone in the chat gets message_reaction at once; others don\'t', async () => {
      const { a, b, conv, msg } = await chat();
      const outsider = await registerAndLogin(app);
      const open = (user) => new Promise((resolve, reject) => {
        const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], reconnection: false });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
      });
      const [sa, so] = await Promise.all([open(a), open(outsider)]);
      const seenByOutsider = [];
      so.on('message_reaction', (e) => seenByOutsider.push(e));
      const got = new Promise((resolve) => sa.on('message_reaction', resolve));
      await new Promise((resolve) => setTimeout(resolve, 150)); // room joins
      await react(b, conv.id, msg.id, 'love');
      expect(await got).toEqual({ conversationId: conv.id, messageId: msg.id, reactions: [{ user_id: b.id, reaction: 'love' }] });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(seenByOutsider).toEqual([]);
      sa.close();
      so.close();
    });
  });
});
