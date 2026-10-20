const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 70: the inbox a page at a time -- most recent activity first, with a
// name search and a one-chat lookup.
describe('GET /conversations, a page at a time', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const inbox = (user, query = {}) => request(app).get('/conversations').query(query).set(auth(user));

  async function world() {
    const me = await registerAndLogin(app);
    const friends = [];
    for (const username of ['zara_q', 'yusuf_q', 'xena_q', 'will_q']) friends.push(await registerAndLogin(app, { username }));
    const chats = [];
    for (const friend of friends) chats.push((await request(app).post('/conversations').set(auth(me)).send({ userId: friend.id })).body);
    const group = (await request(app).post('/conversations/groups').set(auth(me)).send({ name: 'Book club', userIds: [friends[0].id] })).body;
    // Activity, oldest to newest: chats[0..3], then the group.
    for (const chat of [...chats, group]) await request(app).post(`/conversations/${chat.id}/messages`).set(auth(me)).send({ content: 'hi' });
    return { me, friends, chats, group };
  }

  it('pages most recent first with no gaps or repeats; a new message moves a chat to the top', async () => {
    const { me, chats, group } = await world();
    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const res = await inbox(me, { limit: 2, ...(cursor && { cursor }) });
      expect(res.status).toBe(200);
      seen.push(...res.body.conversations.map((c) => c.conversation_id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual([group.id, chats[3].id, chats[2].id, chats[1].id, chats[0].id]);

    await request(app).post(`/conversations/${chats[0].id}/messages`).set(auth(me)).send({ content: 'again' });
    expect((await inbox(me, { limit: 1 })).body.conversations.map((c) => c.conversation_id)).toEqual([chats[0].id]);
  });

  it("q finds chats by the other person's name or the group's name", async () => {
    const { me, chats, group } = await world();
    const ids = async (q) => (await inbox(me, { q })).body.conversations.map((c) => c.conversation_id);
    expect(await ids('XENA')).toEqual([chats[2].id]);
    expect(await ids('book')).toEqual([group.id]);
    expect(await ids('_q')).toHaveLength(4); // "_" is a plain character, not a wildcard
    expect(await ids('nobody')).toEqual([]);
  });

  it('id answers one chat of yours, in the same shape; anyone else\'s is 404', async () => {
    const { me, friends, chats } = await world();
    const one = await inbox(me, { id: chats[1].id });
    expect(one.status).toBe(200);
    expect(one.body.conversations).toHaveLength(1);
    expect(one.body.conversations[0]).toMatchObject({ conversation_id: chats[1].id, type: 'direct', username: friends[1].username, last_message: 'hi' });
    const stranger = await registerAndLogin(app);
    expect((await inbox(stranger, { id: chats[1].id })).status).toBe(404);
    expect((await inbox(me, { id: 'abc' })).status).toBe(400);
    expect((await inbox(me, { cursor: 'nonsense' })).status).toBe(400);
  });
});
