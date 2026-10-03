const crypto = require('crypto');
const request = require('supertest');
const webpush = require('web-push');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 23: the "messages" notification setting and muting one conversation.
describe('message notification settings and muting (Day 23)', () => {
  const { app, reset } = setupTestApp();
  const { pool } = require('../helpers/testDb');
  const push = () => require('../../services/pushService');
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  const keys = webpush.generateVAPIDKeys();
  let sent;
  let realSend;
  let alice;
  let bob;
  let carol;
  let conv;

  beforeEach(async () => {
    await reset();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    sent = [];
    realSend = realSend || push().deps.send;
    push().deps.send = jest.fn(async (sub, payload) => { sent.push(JSON.parse(payload)); return { statusCode: 201 }; });
    alice = await registerAndLogin(app);
    bob = await registerAndLogin(app);
    carol = await registerAndLogin(app);
    conv = (await request(app).post('/conversations').set(auth(bob)).send({ userId: alice.id })).body;
    await request(app).post('/push/subscribe').set(auth(alice)).send({
      endpoint: 'https://fcm.googleapis.com/fcm/send/alice',
      keys: { p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }
    });
  });
  afterEach(() => {
    process.env.VAPID_PUBLIC_KEY = '';
    process.env.VAPID_PRIVATE_KEY = '';
    push().deps.send = realSend;
  });

  const message = async (text = 'hi') => {
    await request(app).post(`/conversations/${conv.id}/messages`).set(auth(bob)).send({ content: text });
    await push().whenIdle();
  };
  const mute = (user, duration, id = conv.id) => request(app).put(`/conversations/${id}/mute`).set(auth(user)).send({ duration });

  it('the "messages" setting exists, defaults to on, and turning it off stops message pushes', async () => {
    expect((await request(app).get('/notification-preferences').set(auth(alice))).body.messages).toBe(true);
    await message();
    expect(sent).toHaveLength(1);
    expect((await request(app).put('/notification-preferences').set(auth(alice)).send({ messages: false })).body.messages).toBe(false);
    await message();
    expect(sent).toHaveLength(1);
  });

  it('muting a chat stops its pushes, for 8 hours / a week / until unmuted', async () => {
    for (const [duration, hours] of [['8h', 8], ['1w', 168]]) {
      const res = await mute(alice, duration);
      expect(res.status).toBe(200);
      expect(res.body.muted).toBe(true);
      const until = new Date(res.body.muted_until).getTime();
      expect(Math.abs(until - (Date.now() + hours * 3600e3))).toBeLessThan(60e3);
    }
    const always = await mute(alice, 'always');
    expect(always.body).toEqual({ muted: true, muted_until: null });
    await message();
    expect(sent).toHaveLength(0);

    expect((await mute(alice, null)).body).toEqual({ muted: false, muted_until: null });
    await message();
    expect(sent).toHaveLength(1);
  });

  it('a mute that has run out no longer applies', async () => {
    await mute(alice, '8h');
    await pool.query("UPDATE conversation_participants SET muted_until = now() - interval '1 minute' WHERE user_id = $1", [alice.id]);
    await message();
    expect(sent).toHaveLength(1);
  });

  it('muting is personal: bob still gets pushes from the same chat', async () => {
    await request(app).post('/push/subscribe').set(auth(bob)).send({
      endpoint: 'https://fcm.googleapis.com/fcm/send/bob',
      keys: { p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }
    });
    await mute(alice, 'always');
    await request(app).post(`/conversations/${conv.id}/messages`).set(auth(alice)).send({ content: 'hello' });
    await push().whenIdle();
    expect(sent).toHaveLength(1); // to bob
  });

  it('the inbox and the chat details say whether it is muted (for you)', async () => {
    await mute(alice, 'always');
    const aliceInbox = (await request(app).get('/conversations').set(auth(alice))).body;
    const bobInbox = (await request(app).get('/conversations').set(auth(bob))).body;
    const list = (b) => (Array.isArray(b) ? b : b.conversations);
    expect(list(aliceInbox).find((c) => c.conversation_id === conv.id).muted).toBe(true);
    expect(list(bobInbox).find((c) => c.conversation_id === conv.id).muted).toBe(false);
    expect((await request(app).get(`/conversations/${conv.id}`).set(auth(alice))).body).toMatchObject({ muted: true, muted_until: null });
  });

  it('groups can be muted too', async () => {
    const group = (await request(app).post('/conversations/groups').set(auth(bob)).send({ name: 'Trip', userIds: [alice.id, carol.id] })).body;
    expect((await mute(alice, '1w', group.id)).body.muted).toBe(true);
    await request(app).post(`/conversations/${group.id}/messages`).set(auth(bob)).send({ content: 'plan' });
    await push().whenIdle();
    expect(sent).toHaveLength(0);
    const inbox = (await request(app).get('/conversations').set(auth(alice))).body;
    const list = Array.isArray(inbox) ? inbox : inbox.conversations;
    expect(list.find((c) => c.conversation_id === group.id).muted).toBe(true);
  });

  it('only people in the chat; only the known durations', async () => {
    const outsider = await mute(carol, '8h');
    const missing = await mute(carol, '8h', 999999);
    expect(outsider.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(outsider.text).toBe(missing.text);
    for (const duration of ['1h', 'forever', 8, '', "8h'; DROP TABLE users; --"]) {
      expect((await mute(alice, duration)).status).toBe(400);
    }
    expect((await request(app).put(`/conversations/${conv.id}/mute`).send({ duration: '8h' })).status).toBe(401);
  });
});
