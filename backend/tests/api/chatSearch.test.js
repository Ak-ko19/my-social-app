const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 99: searching inside a chat, and the messages around a result.
describe('search inside a chat (Day 99)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  // These tests send many messages in one chat.
  beforeEach(resetMessageRateLimits);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const chatWith = async (me, other) => (await request(app).post('/conversations').set(auth(me)).send({ userId: other.id })).body.id;
  const say = async (user, id, content) => (await request(app).post(`/conversations/${id}/messages`).set(auth(user)).send({ content })).body;
  const search = (user, id, q, extra = '') => request(app).get(`/conversations/${id}/search?q=${encodeURIComponent(q)}${extra}`).set(auth(user));
  // Messages a second apart, in the order sent.
  async function thread(id, lines) {
    const out = [];
    for (const [user, text] of lines) out.push(await say(user, id, text));
    for (let i = 0; i < out.length; i++) {
      await pool.query("UPDATE messages SET created_at = now() - make_interval(secs => $2) WHERE id = $1", [out[i].id, 1000 - i]);
    }
    return out;
  }

  it('finds text messages containing the words, newest first, with the sender', async () => {
    const me = await registerAndLogin(app);
    const ana = await registerAndLogin(app);
    const id = await chatWith(me, ana);
    const [m1, , m3] = await thread(id, [[me, 'Meet at the Tea House?'], [ana, 'sure'], [ana, 'The tea house at 5 then']]);
    const res = await search(me, id, 'tea house');
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.id)).toEqual([m3.id, m1.id]);
    expect(res.body.results[0]).toMatchObject({ sender_id: ana.id, sender_username: ana.username, type: 'text', content: 'The tea house at 5 then' });
    expect(res.body.nextCursor).toBeNull();
    // The other person searches the same chat.
    expect((await search(ana, id, 'TEA')).body.results).toHaveLength(2);
  });

  it('photo captions count; deleted messages and voice notes do not', async () => {
    const me = await registerAndLogin(app);
    const ana = await registerAndLogin(app);
    const id = await chatWith(me, ana);
    const [gone] = await thread(id, [[me, 'secret plan'], [me, 'plan B']]);
    await request(app).delete(`/conversations/${id}/messages/${gone.id}`).set(auth(me));
    await pool.query("INSERT INTO messages (conversation_id, sender_id, type, content, media_url) VALUES ($1, $2, 'image', 'The plan, drawn', 'https://res.cloudinary.com/x/image/upload/v1/a.png')", [id, ana.id]);
    await pool.query("INSERT INTO messages (conversation_id, sender_id, type, content, media_url, duration_seconds) VALUES ($1, $2, 'voice', 'plan', 'https://res.cloudinary.com/x/video/upload/v1/a.webm', 3)", [id, ana.id]);
    const found = (await search(me, id, 'plan')).body.results;
    expect(found.map((r) => r.content).sort()).toEqual(['The plan, drawn', 'plan B']);
  });

  it('only people in the chat; 2 to 100 characters; % and _ are searched as themselves', async () => {
    const me = await registerAndLogin(app);
    const ana = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const id = await chatWith(me, ana);
    await thread(id, [[me, '100% sure'], [me, 'file_name.txt'], [me, 'nothing special']]);
    expect((await search(outsider, id, 'sure')).status).toBe(403);
    const short = await search(me, id, ' a ');
    expect([short.status, short.text]).toEqual([400, 'Search for at least 2 characters.']);
    expect((await request(app).get(`/conversations/${id}/search`).set(auth(me))).status).toBe(400);
    expect((await search(me, id, '0%')).body.results.map((r) => r.content)).toEqual(['100% sure']);
    expect((await search(me, id, 'e_n')).body.results.map((r) => r.content)).toEqual(['file_name.txt']);
    expect((await search(me, id, '%%')).body.results).toEqual([]);
    expect((await request(app).get(`/conversations/${id}/search?q=x`)).status).toBe(401);
  });

  it('Burmese typed in Zawgyi finds the Unicode text', async () => {
    const me = await registerAndLogin(app);
    const ana = await registerAndLogin(app);
    const id = await chatWith(me, ana);
    await thread(id, [[ana, 'မောင်မောင် နေကောင်းလား']]);
    expect((await search(me, id, 'ေမာင္ေမာင္')).body.results).toHaveLength(1);
  });

  it('pages by a cursor, newest first, none twice', async () => {
    const me = await registerAndLogin(app);
    const ana = await registerAndLogin(app);
    const id = await chatWith(me, ana);
    const sent = await thread(id, Array.from({ length: 5 }, (_, i) => [me, `match ${i}`]));
    const first = (await search(me, id, 'match', '&limit=2')).body;
    const second = (await search(me, id, 'match', `&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)).body;
    const third = (await search(me, id, 'match', `&limit=2&cursor=${encodeURIComponent(second.nextCursor)}`)).body;
    expect([...first.results, ...second.results, ...third.results].map((r) => r.id)).toEqual(sent.map((m) => m.id).reverse());
    expect(third.nextCursor).toBeNull();
  });

  it('the messages around a result: 10 before, it, 10 after, oldest first', async () => {
    const me = await registerAndLogin(app);
    const ana = await registerAndLogin(app);
    const id = await chatWith(me, ana);
    const sent = await thread(id, Array.from({ length: 30 }, (_, i) => [i % 2 ? ana : me, `line ${i}`]));
    const res = await request(app).get(`/conversations/${id}/messages/${sent[15].id}/context`).set(auth(me));
    expect(res.status).toBe(200);
    expect(res.body.messageId).toBe(sent[15].id);
    expect(res.body.messages.map((m) => m.id)).toEqual(sent.slice(5, 26).map((m) => m.id));
    // Near the start: what there is.
    const early = (await request(app).get(`/conversations/${id}/messages/${sent[2].id}/context`).set(auth(me))).body;
    expect(early.messages.map((m) => m.id)).toEqual(sent.slice(0, 13).map((m) => m.id));
    // A deleted neighbour keeps its place without its text.
    await request(app).delete(`/conversations/${id}/messages/${sent[14].id}`).set(auth(me));
    const again = (await request(app).get(`/conversations/${id}/messages/${sent[15].id}/context`).set(auth(me))).body;
    expect(again.messages.find((m) => m.id === sent[14].id).content).toBeNull();
  });

  it('context: not in this chat, deleted, or not yours -- refused', async () => {
    const me = await registerAndLogin(app);
    const ana = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const id = await chatWith(me, ana);
    const other = await chatWith(me, outsider);
    const [m] = await thread(id, [[me, 'hello']]);
    const [elsewhere] = await thread(other, [[me, 'hi']]);
    expect((await request(app).get(`/conversations/${id}/messages/${elsewhere.id}/context`).set(auth(me))).status).toBe(404);
    expect((await request(app).get(`/conversations/${id}/messages/${m.id}/context`).set(auth(outsider))).status).toBe(403);
    await request(app).delete(`/conversations/${id}/messages/${m.id}`).set(auth(me));
    expect((await request(app).get(`/conversations/${id}/messages/${m.id}/context`).set(auth(me))).status).toBe(404);
  });

  it('in a group, each result names its sender', async () => {
    const me = await registerAndLogin(app);
    const [a, b] = await Promise.all([registerAndLogin(app), registerAndLogin(app)]);
    const group = (await request(app).post('/conversations/groups').set(auth(me)).send({ name: 'Trip', userIds: [a.id, b.id] })).body;
    await thread(group.id, [[a, 'bring the map'], [b, 'the map is mine']]);
    const found = (await search(me, group.id, 'map')).body.results;
    expect(found.map((r) => r.sender_username)).toEqual([b.username, a.username]);
  });
});
