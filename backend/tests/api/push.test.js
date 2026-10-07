const crypto = require('crypto');
const request = require('supertest');
const webpush = require('web-push');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 22: web push. The sender (pushService deps.send) is replaced, so
// nothing leaves the machine; everything up to that call is real. The real
// sender is exercised end to end by the e2e suite day22-push.
describe('web push (Day 22)', () => {
  const { app, reset } = setupTestApp();
  const { pool } = require('../helpers/testDb');
  const push = () => require('../../services/pushService');
  const presence = () => require('../../sockets/presence');

  const keys = webpush.generateVAPIDKeys();
  const subKeys = () => ({
    p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'),
    auth: crypto.randomBytes(16).toString('base64url')
  });
  const fcm = (n = crypto.randomBytes(4).toString('hex')) => `https://fcm.googleapis.com/fcm/send/${n}`;
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  const subscribe = (u, body) => request(app).post('/push/subscribe').set(auth(u)).send(body);
  let sent;
  let realSend;

  const turnOn = () => {
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  };

  beforeEach(async () => {
    await reset();
    sent = [];
    realSend = realSend || push().deps.send;
    push().deps.send = jest.fn(async (sub, payload, options) => {
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options });
      return { statusCode: 201 };
    });
    turnOn();
  });
  afterEach(() => {
    for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) process.env[k] = '';
    push().deps.send = realSend;
  });

  describe('switching it on', () => {
    it('/push/config gives the public key only when push is configured', async () => {
      expect((await request(app).get('/push/config')).body).toEqual({ publicKey: keys.publicKey });
      process.env.VAPID_PRIVATE_KEY = '';
      expect((await request(app).get('/push/config')).body).toEqual({ publicKey: null });
      const user = await registerAndLogin(app);
      expect((await subscribe(user, { endpoint: fcm(), keys: subKeys() })).status).toBe(503);
    });

    it('accepts the browsers\' push services', async () => {
      const user = await registerAndLogin(app);
      for (const endpoint of [fcm(), 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/QGx', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
        expect((await subscribe(user, { endpoint, keys: subKeys() })).status).toBe(201);
      }
      expect((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n).toBe(4);
    });

    it('refuses any other endpoint -- the server would POST to it (SSRF)', async () => {
      const user = await registerAndLogin(app);
      for (const endpoint of [
        'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.evil.example/x', 'https://evilfcm.googleapis.com.example/x',
        'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest',
        'https://example.com/push', 'file:///etc/passwd', '', null, `https://fcm.googleapis.com/${'a'.repeat(1100)}`,
        // look-alikes that merely CONTAIN a push service's domain
        'https://notify.windows.com.evil.example/x', 'https://xpush.apple.com/x', 'https://evilpush.services.mozilla.com.example/x'
      ]) {
        const res = await subscribe(user, { endpoint, keys: subKeys() });
        expect(res.status).toBe(400);
        expect(res.text).toBe('That push endpoint is not accepted');
      }
    });

    it('checks the keys', async () => {
      const user = await registerAndLogin(app);
      for (const k of [undefined, {}, { p256dh: 'short', auth: 'x' }, { p256dh: subKeys().p256dh, auth: 'has spaces in it!!!!!!' }]) {
        const res = await subscribe(user, { endpoint: fcm(), keys: k });
        expect(res.status).toBe(400);
        expect(res.text).toBe('Invalid push subscription keys');
      }
    });

    it('a browser re-subscribing under another account moves to that account', async () => {
      const a = await registerAndLogin(app);
      const b = await registerAndLogin(app);
      const endpoint = fcm('same-browser');
      await subscribe(a, { endpoint, keys: subKeys() });
      await subscribe(b, { endpoint, keys: subKeys() });
      expect((await pool.query('SELECT user_id FROM push_subscriptions')).rows).toEqual([{ user_id: b.id }]);
    });

    it('keeps each person\'s newest 10 devices', async () => {
      const user = await registerAndLogin(app);
      for (let i = 0; i < 12; i += 1) await subscribe(user, { endpoint: fcm(`d${i}`), keys: subKeys() });
      const rows = (await pool.query('SELECT endpoint FROM push_subscriptions ORDER BY id')).rows.map((r) => r.endpoint);
      expect(rows).toHaveLength(10);
      expect(rows).not.toContain(fcm('d0'));
      expect(rows).toContain(fcm('d11'));
    });

    it('turning it off removes only your own subscription; login required', async () => {
      const a = await registerAndLogin(app);
      const b = await registerAndLogin(app);
      await subscribe(a, { endpoint: fcm('a'), keys: subKeys() });
      expect((await request(app).delete('/push/subscribe').set(auth(b)).send({ endpoint: fcm('a') })).status).toBe(204);
      expect((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n).toBe(1);
      expect((await request(app).delete('/push/subscribe').set(auth(a)).send({ endpoint: fcm('a') })).status).toBe(204);
      expect((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n).toBe(0);
      expect((await request(app).post('/push/subscribe').send({})).status).toBe(401);
    });
  });

  describe('what gets pushed', () => {
    let alice;
    let bob;
    beforeEach(async () => {
      alice = await registerAndLogin(app, { username: `alice${Date.now() % 100000}` });
      bob = await registerAndLogin(app, { username: `bob${Date.now() % 100000}` });
      await subscribe(alice, { endpoint: fcm('alice-phone'), keys: subKeys() });
    });

    it('a like on your post, in your language, linking to the post', async () => {
      await pool.query("UPDATE users SET language = 'ar' WHERE id = $1", [alice.id]);
      const post = (await request(app).post('/posts').set(auth(alice)).field('content', 'hi')).body;
      await request(app).post(`/posts/${post.id}/like`).set(auth(bob));
      await push().whenIdle();
      expect(sent).toHaveLength(1);
      expect(sent[0].endpoint).toBe(fcm('alice-phone'));
      expect(sent[0].payload).toEqual({
        title: 'MySocialApp', body: `أعجب ${bob.username} بمنشورك`, url: `/posts/${post.id}`, tag: `post-${post.id}`
      });
      expect(sent[0].options.TTL).toBe(86400);
      expect(sent[0].options.vapidDetails.publicKey).toBe(keys.publicKey);
    });

    // Day 45: about your own scheduled post, in your language; a failed one
    // opens the drafts.
    it('scheduled post published / failed', async () => {
      await pool.query("UPDATE users SET language = 'ar' WHERE id = $1", [alice.id]);
      const post = (await request(app).post('/posts').set(auth(alice)).field('content', 'hi')).body;
      const { notifySystem } = require('../../services/notificationService');
      await notifySystem({ userId: alice.id, type: 'scheduled_post', postId: post.id });
      await notifySystem({ userId: alice.id, type: 'scheduled_failed' });
      await push().whenIdle();
      // Sent in parallel: in either order.
      expect(sent).toHaveLength(2);
      expect(sent.map((s) => s.payload)).toEqual(expect.arrayContaining([
        { title: 'MySocialApp', body: 'نُشر منشورك المجدول', url: `/posts/${post.id}`, tag: `post-${post.id}` },
        { title: 'MySocialApp', body: 'تعذّر نشر منشورك المجدول. أُعيد إلى مسوداتك.', url: '/drafts', tag: `notify-scheduled_failed-${alice.id}` }
      ]));
    });

    it('respects the notification settings (likes off -> no push)', async () => {
      await request(app).put('/notification-preferences').set(auth(alice)).send({ likes: false });
      const post = (await request(app).post('/posts').set(auth(alice)).field('content', 'hi')).body;
      await request(app).post(`/posts/${post.id}/like`).set(auth(bob));
      await push().whenIdle();
      expect(sent).toHaveLength(0);
    });

    it('a mention', async () => {
      await request(app).post('/posts').set(auth(bob)).field('content', `hey @${alice.username}`);
      await push().whenIdle();
      expect(sent.map((s) => s.payload.body)).toEqual([`${bob.username} mentioned you in a post`]);
    });

    it('a message -- without its text -- only while you are not in the app', async () => {
      const conv = (await request(app).post('/conversations').set(auth(bob)).send({ userId: alice.id })).body;
      await request(app).post(`/conversations/${conv.id}/messages`).set(auth(bob)).send({ content: 'my secret plans' });
      await push().whenIdle();
      expect(sent).toHaveLength(1);
      expect(sent[0].payload).toEqual({ title: 'MySocialApp', body: `${bob.username} sent you a message`, url: `/messages/${conv.id}`, tag: `conversation-${conv.id}` });
      expect(JSON.stringify(sent)).not.toContain('secret plans');

      presence().markOnline(alice.id, 'socket-1');
      try {
        await request(app).post(`/conversations/${conv.id}/messages`).set(auth(bob)).send({ content: 'again' });
        await push().whenIdle();
        expect(sent).toHaveLength(1); // no second push: she's in the app
      } finally {
        presence().markOffline(alice.id, 'socket-1');
      }
    });

    it('the sender never gets a push for their own message; Arabic text', async () => {
      await pool.query("UPDATE users SET language = 'ar' WHERE id = $1", [alice.id]);
      const conv = (await request(app).post('/conversations').set(auth(alice)).send({ userId: bob.id })).body;
      await request(app).post(`/conversations/${conv.id}/messages`).set(auth(alice)).send({ content: 'hi' });
      await push().whenIdle();
      expect(sent).toHaveLength(0); // bob has no device; alice is the sender
      await request(app).post(`/conversations/${conv.id}/messages`).set(auth(bob)).send({ content: 'hello' });
      await push().whenIdle();
      expect(sent.map((s) => s.payload.body)).toEqual([`أرسل إليك ${bob.username} رسالة`]);
    });

    it('an expired subscription (410) is deleted; other failures keep it', async () => {
      push().deps.send = jest.fn(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
      const post = (await request(app).post('/posts').set(auth(alice)).field('content', 'hi')).body;
      await request(app).post(`/posts/${post.id}/like`).set(auth(bob));
      await push().whenIdle();
      expect((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n).toBe(0);

      await subscribe(alice, { endpoint: fcm('alice-2'), keys: subKeys() });
      push().deps.send = jest.fn(async () => { throw Object.assign(new Error('busy'), { statusCode: 503 }); });
      await request(app).post(`/posts/${post.id}/comments`).set(auth(bob)).send({ content: 'nice' });
      await push().whenIdle();
      expect((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n).toBe(1);
    });

    it('with push switched off, nothing is sent', async () => {
      process.env.VAPID_PUBLIC_KEY = '';
      const post = (await request(app).post('/posts').set(auth(alice)).field('content', 'hi')).body;
      await request(app).post(`/posts/${post.id}/like`).set(auth(bob));
      await push().whenIdle();
      expect(sent).toHaveLength(0);
    });
  });
});
