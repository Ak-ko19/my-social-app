const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 32: forward a message to up to 5 of your chats. Each forward is a new
// message from the forwarder, labelled is_forwarded; each chat gets the
// same checks as a normal send and succeeds or fails on its own.
describe('forward a message (Day 32)', () => {
  const { app, reset } = setupTestApp();
  const cloudinary = require('../../config/cloudinary'); // the setupTestApp mock
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const dm = async (a, b) => (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
  const say = async (user, convId, content) => (await request(app).post(`/conversations/${convId}/messages`).set(auth(user)).send({ content })).body;
  const forward = (user, convId, msgId, conversationIds) =>
    request(app).post(`/conversations/${convId}/messages/${msgId}/forward`).set(auth(user)).send({ conversationIds });
  const messagesOf = async (user, convId) => (await request(app).get(`/conversations/${convId}/messages`).set(auth(user))).body.messages;

  // me chats with source (who wrote the message), friend and a group.
  async function setup() {
    const me = await registerAndLogin(app);
    const source = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const member = await registerAndLogin(app);
    const from = await dm(source, me);
    const toFriend = await dm(me, friend);
    const group = (await request(app).post('/conversations/groups').set(auth(me)).send({ name: 'Tea club', userIds: [member.id] })).body;
    const original = await say(source, from.id, 'Meet at 6 at the tea shop');
    return { me, source, friend, member, from, toFriend, group, original };
  }

  it('forwards a text to a DM and a group: new messages from me, labelled, nothing about the author', async () => {
    const { me, friend, member, from, toFriend, group, original } = await setup();
    const res = await forward(me, from.id, original.id, [toFriend.id, group.id]);
    expect(res.status).toBe(201);
    expect(res.body.failed).toEqual([]);
    expect(res.body.forwarded).toHaveLength(2);
    for (const m of res.body.forwarded) {
      expect(m).toMatchObject({ sender_id: me.id, content: 'Meet at 6 at the tea shop', type: 'text', is_forwarded: true, reply_to: null, reactions: [] });
    }
    const seenByFriend = (await messagesOf(friend, toFriend.id)).at(-1);
    expect(seenByFriend).toMatchObject({ content: 'Meet at 6 at the tea shop', is_forwarded: true, sender_id: me.id });
    expect((await messagesOf(member, group.id)).at(-1)).toMatchObject({ is_forwarded: true });
    // The original is untouched and not marked.
    expect((await messagesOf(me, from.id)).at(-1)).toMatchObject({ id: original.id, is_forwarded: false });
  });

  it('a normal message is not marked as forwarded', async () => {
    const { me, toFriend } = await setup();
    expect((await say(me, toFriend.id, 'hi')).is_forwarded).toBe(false);
  });

  it('checks the request: 1-5 chats, valid ids; repeated ids count once', async () => {
    const { me, from, toFriend, original } = await setup();
    expect((await forward(me, from.id, original.id, [])).status).toBe(400);
    expect((await forward(me, from.id, original.id, undefined)).status).toBe(400);
    expect((await forward(me, from.id, original.id, ['x'])).status).toBe(400);
    expect((await forward(me, from.id, original.id, [1, 2, 3, 4, 5, 6])).status).toBe(400);
    const twice = await forward(me, from.id, original.id, [toFriend.id, toFriend.id]);
    expect(twice.status).toBe(201);
    expect(twice.body.forwarded).toHaveLength(1);
  });

  it('only from a chat you are in, a message that is there and not unsent', async () => {
    const { me, source, friend, from, toFriend, original } = await setup();
    expect((await forward(friend, from.id, original.id, [toFriend.id])).status).toBe(403);
    const elsewhere = await say(me, toFriend.id, 'other chat');
    expect((await forward(me, from.id, elsewhere.id, [toFriend.id])).status).toBe(404);
    await request(app).delete(`/conversations/${from.id}/messages/${original.id}`).set(auth(source));
    expect((await forward(me, from.id, original.id, [toFriend.id])).status).toBe(409);
  });

  it('a chat you are not in fails on its own; the others still go out', async () => {
    const { me, source, friend, from, toFriend, original } = await setup();
    const notMine = await dm(source, friend);
    const res = await forward(me, from.id, original.id, [notMine.id, toFriend.id]);
    expect(res.status).toBe(201);
    expect(res.body.forwarded.map((m) => m.conversation_id)).toEqual([toFriend.id]);
    expect(res.body.failed).toEqual([expect.objectContaining({ conversationId: notMine.id, status: 403 })]);
    expect((await messagesOf(source, notMine.id))).toEqual([]);
  });

  it('when every chat fails, the answer has the failure status', async () => {
    const { me, source, friend, from, original } = await setup();
    const notMine = await dm(source, friend);
    const res = await forward(me, from.id, original.id, [notMine.id]);
    expect(res.status).toBe(403);
    expect(res.body.forwarded).toEqual([]);
  });

  it('no forwarding to someone you blocked or who blocked you', async () => {
    const { me, friend, from, toFriend, original } = await setup();
    await request(app).post(`/users/${me.id}/block`).set(auth(friend));
    const res = await forward(me, from.id, original.id, [toFriend.id]);
    expect(res.status).toBe(403);
    expect(res.body.failed[0]).toMatchObject({ conversationId: toFriend.id, status: 403 });
  });

  it('counts against the send rate limit of the chat it goes to', async () => {
    const { me, from, toFriend, original } = await setup();
    for (let i = 0; i < 10; i += 1) await say(me, toFriend.id, `msg ${i}`);
    const res = await forward(me, from.id, original.id, [toFriend.id]);
    expect(res.status).toBe(429);
    expect(res.body.failed[0].status).toBe(429);
  });

  it('the data download shows which of my messages are forwards', async () => {
    const { me, from, toFriend, original } = await setup();
    await forward(me, from.id, original.id, [toFriend.id]);
    const data = JSON.parse((await request(app).get('/profile/export').set(auth(me))).text);
    const chat = data.conversations.find((c) => c.id === toFriend.id);
    expect(chat.messages.at(-1)).toMatchObject({ content: 'Meet at 6 at the tea shop', is_forwarded: true });
  });

  describe('photos (Cloudinary on)', () => {
    const CLOUD_ENV = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
    const saved = {};
    beforeAll(() => { for (const [k, v] of Object.entries(CLOUD_ENV)) { saved[k] = process.env[k]; process.env[k] = v; } });
    afterAll(() => { for (const k of Object.keys(CLOUD_ENV)) process.env[k] = saved[k]; });
    beforeEach(() => {
      cloudinary.uploader.upload.mockClear();
      cloudinary.api.delete_resources.mockClear();
    });

    it('each forward gets its own copy of the file, so unsending the original leaves forwards intact', async () => {
      const { me, source, from, toFriend, group } = await setup();
      const png = Buffer.from('89504e470d0a1a0a', 'hex');
      const photo = (await request(app).post(`/conversations/${from.id}/messages/image`).set(auth(source))
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' })).body;
      const res = await forward(me, from.id, photo.id, [toFriend.id, group.id]);
      expect(res.status).toBe(201);
      const urls = res.body.forwarded.map((m) => m.media_url);
      expect(cloudinary.uploader.upload).toHaveBeenCalledTimes(2);
      expect(cloudinary.uploader.upload).toHaveBeenCalledWith(photo.media_url, expect.objectContaining({ resource_type: 'image' }));
      expect(new Set([photo.media_url, ...urls]).size).toBe(3);

      await request(app).delete(`/conversations/${from.id}/messages/${photo.id}`).set(auth(source));
      await new Promise((resolve) => setTimeout(resolve, 20));
      const deleted = cloudinary.api.delete_resources.mock.calls.flatMap(([ids]) => ids);
      expect(deleted).toEqual([photo.media_url.match(/upload\/v\d+\/(.+)\.\w+$/)[1]]);
      expect((await messagesOf(me, toFriend.id)).at(-1).media_url).toBe(urls[0]);
    });

    it('a refused chat copies nothing', async () => {
      const { me, source, friend, from } = await setup();
      const png = Buffer.from('89504e470d0a1a0a', 'hex');
      const photo = (await request(app).post(`/conversations/${from.id}/messages/image`).set(auth(source))
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' })).body;
      const notMine = await dm(source, friend);
      await forward(me, from.id, photo.id, [notMine.id]);
      expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
    });
  });
});
