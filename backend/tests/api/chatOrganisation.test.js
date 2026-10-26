const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Days 97-98: pinned and archived chats (Messenger / WhatsApp), per person.
describe('pinned and archived chats (Days 97-98)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const chatWith = async (me, other) => (await request(app).post('/conversations').set(auth(me)).send({ userId: other.id })).body.id;
  const say = (user, id, content) => request(app).post(`/conversations/${id}/messages`).set(auth(user)).send({ content });
  const inbox = async (user, query = '') => (await request(app).get(`/conversations${query}`).set(auth(user))).body;
  const ids = (page) => page.conversations.map((c) => c.conversation_id);
  const pin = (user, id, pinned = true) => request(app).put(`/conversations/${id}/pin`).set(auth(user)).send({ pinned });
  const archive = (user, id, archived = true) => request(app).put(`/conversations/${id}/archive`).set(auth(user)).send({ archived });
  // Chats with n people, the newest last, each with a message a second apart.
  async function chats(me, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const other = await registerAndLogin(app);
      const id = await chatWith(me, other);
      await say(other, id, `hi ${i}`);
      await pool.query("UPDATE messages SET created_at = now() - make_interval(secs => $2) WHERE conversation_id = $1", [id, 100 - i]);
      out.push({ id, other });
    }
    return out;
  }

  it('pinned chats come first, the most recently pinned first; unpin puts it back', async () => {
    const me = await registerAndLogin(app);
    const [a, b, c] = await chats(me, 3);
    expect(ids(await inbox(me))).toEqual([c.id, b.id, a.id]);
    expect((await pin(me, a.id)).body).toEqual({ pinned: true, archived: false });
    await pool.query("UPDATE conversation_participants SET pinned_at = now() - interval '1 minute' WHERE conversation_id = $1 AND user_id = $2", [a.id, me.id]);
    await pin(me, b.id);
    const page = await inbox(me);
    expect(ids(page)).toEqual([b.id, a.id, c.id]);
    expect(page.conversations.map((r) => r.pinned)).toEqual([true, true, false]);
    // Pinning again changes nothing; unpinning puts it in its place.
    expect((await pin(me, b.id)).status).toBe(200);
    expect((await pin(me, b.id, false)).body).toEqual({ pinned: false, archived: false });
    expect(ids(await inbox(me))).toEqual([a.id, c.id, b.id]);
    // Only mine: the other person's inbox is unchanged.
    expect((await inbox(a.other)).conversations[0].pinned).toBe(false);
  });

  it('pinned order is by when they were pinned, not by last message; pinning again keeps the place', async () => {
    const me = await registerAndLogin(app);
    const [a, b, c] = await chats(me, 3); // c has the newest message, a the oldest
    await pin(me, c.id);
    await pool.query("UPDATE conversation_participants SET pinned_at = now() - interval '1 minute' WHERE conversation_id = $1 AND user_id = $2", [c.id, me.id]);
    await pin(me, a.id); // pinned later, though its last message is older
    expect(ids(await inbox(me))).toEqual([a.id, c.id, b.id]);
    // Pinning c again doesn't move it up.
    await pin(me, c.id);
    expect(ids(await inbox(me))).toEqual([a.id, c.id, b.id]);
  });

  it('up to 3 pinned', async () => {
    const me = await registerAndLogin(app);
    const list = await chats(me, 4);
    for (const chat of list.slice(0, 3)) expect((await pin(me, chat.id)).status).toBe(200);
    const fourth = await pin(me, list[3].id);
    expect([fourth.status, fourth.text]).toEqual([400, 'You can pin up to 3 chats.']);
    // Two at once can't make a fourth either.
    await pin(me, list[0].id, false);
    const both = await Promise.all([pin(me, list[0].id), pin(me, list[3].id)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(Number((await pool.query('SELECT count(*) FROM conversation_participants WHERE user_id = $1 AND pinned_at IS NOT NULL', [me.id])).rows[0].count)).toBe(3);
  });

  it('paging: pinned chats are all on the first page, no chat twice or lost', async () => {
    const me = await registerAndLogin(app);
    const list = await chats(me, 7);
    await pin(me, list[1].id);
    await pin(me, list[4].id);
    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = await inbox(me, `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (pages > 0) expect(page.conversations.some((c) => c.pinned)).toBe(false);
      seen.push(...ids(page));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(seen.slice(0, 2)).toEqual([list[4].id, list[1].id]);
    expect([...seen].sort((x, y) => x - y)).toEqual(list.map((c) => c.id).sort((x, y) => x - y));
    expect(new Set(seen).size).toBe(7);
  });

  it('archived chats leave the inbox for "Archived chats"; archiving unpins; unarchive brings it back', async () => {
    const me = await registerAndLogin(app);
    const [a, b] = await chats(me, 2);
    await pin(me, a.id);
    expect((await archive(me, a.id)).body).toEqual({ pinned: false, archived: true });
    let page = await inbox(me);
    expect(ids(page)).toEqual([b.id]);
    expect(page.archivedCount).toBe(1);
    const archived = await inbox(me, '?archived=1');
    expect(ids(archived)).toEqual([a.id]);
    expect(archived.conversations[0]).toMatchObject({ archived: true, pinned: false });
    expect(archived.archivedCount).toBeUndefined();
    expect((await archive(me, a.id, false)).body).toEqual({ pinned: false, archived: false });
    page = await inbox(me);
    expect(ids(page)).toEqual([b.id, a.id]);
    expect(page.archivedCount).toBe(0);
    // Pinning an archived chat brings it back too.
    await archive(me, b.id);
    expect((await pin(me, b.id)).body).toEqual({ pinned: true, archived: false });
    expect((await inbox(me)).conversations[0]).toMatchObject({ conversation_id: b.id, pinned: true });
  });

  it('a new message brings an archived chat back -- unless you also muted it', async () => {
    const me = await registerAndLogin(app);
    const [a, b] = await chats(me, 2);
    await archive(me, a.id);
    await archive(me, b.id);
    await request(app).put(`/conversations/${b.id}/mute`).set(auth(me)).send({ duration: 'always' });
    await say(a.other, a.id, 'are you there?');
    await say(b.other, b.id, 'news!');
    expect(ids(await inbox(me))).toEqual([a.id]);
    expect(ids(await inbox(me, '?archived=1'))).toEqual([b.id]);
    // Your own message brings it back for you too.
    await request(app).put(`/conversations/${b.id}/mute`).set(auth(me)).send({ duration: null });
    await say(me, b.id, 'back');
    expect(ids(await inbox(me, '?archived=1'))).toEqual([]);
  });

  it('search finds pinned and archived chats in their own list', async () => {
    const me = await registerAndLogin(app);
    const [a, b] = await chats(me, 2);
    await pin(me, a.id);
    await archive(me, b.id);
    expect(ids(await inbox(me, `?q=${a.other.username}`))).toEqual([a.id]);
    expect(ids(await inbox(me, `?q=${b.other.username}`))).toEqual([]);
    expect(ids(await inbox(me, `?archived=1&q=${b.other.username}`))).toEqual([b.id]);
  });

  it("not your chat, bad values: refused; groups work the same", async () => {
    const me = await registerAndLogin(app);
    const outsider = await registerAndLogin(app);
    const [a] = await chats(me, 1);
    expect((await pin(outsider, a.id)).status).toBe(404);
    expect((await archive(outsider, a.id)).status).toBe(404);
    expect((await pin(me, 999999)).status).toBe(404);
    expect((await request(app).put(`/conversations/${a.id}/pin`).set(auth(me)).send({ pinned: 'yes' })).text).toBe('pinned must be true or false');
    expect((await request(app).put(`/conversations/${a.id}/archive`).set(auth(me)).send({})).text).toBe('archived must be true or false');
    expect((await request(app).put('/conversations/1.5/pin').set(auth(me)).send({ pinned: true })).status).toBe(400);
    expect((await request(app).get('/conversations?archived=yes').set(auth(me))).status).toBe(400);
    expect((await request(app).put(`/conversations/${a.id}/pin`).send({ pinned: true })).status).toBe(401);

    const friend = await registerAndLogin(app);
    const group = (await request(app).post('/conversations/groups').set(auth(me)).send({ name: 'Hikers', userIds: [friend.id] })).body;
    expect((await pin(me, group.id)).status).toBe(200);
    const row = (await inbox(me)).conversations.find((c) => c.conversation_id === group.id);
    expect(row).toMatchObject({ type: 'group', pinned: true, archived: false });
  });

  it('is in your data export', async () => {
    const me = await registerAndLogin(app);
    const [a] = await chats(me, 1);
    await pin(me, a.id);
    const data = (await request(app).get('/profile/export').set(auth(me))).body;
    const chat = data.conversations.find((c) => c.id === a.id);
    expect(chat.pinned_at).toEqual(expect.any(String));
    expect(chat.archived_at).toBeNull();
  });
});
