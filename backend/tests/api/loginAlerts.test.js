const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 77: "New login" alerts (services/loginAlertService.js).
const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

describe('new login alerts', () => {
  const { app, reset } = setupTestApp();
  const email = require('../../utils/email');
  const cleanup = require('../../services/cleanupService');
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());
  const login = (user, ua) => request(app).post('/login').set('User-Agent', ua).send({ email: user.email, password: user.password });
  const alerts = async (user) => (await pool.query("SELECT device FROM notifications WHERE user_id = $1 AND type = 'new_login' ORDER BY id", [user.id])).rows.map((r) => r.device);

  // registerAndLogin logs in once (supertest's own user agent): device one.
  it("doesn't alert for the first device, or the same one again", async () => {
    const me = await registerAndLogin(app);
    expect(await alerts(me)).toEqual([]);
    expect((await login(me, CHROME_WINDOWS)).status).toBe(200); // a second kind: alert
    expect((await login(me, CHROME_WINDOWS)).status).toBe(200); // the same kind again: none
    expect(await alerts(me)).toEqual([{ browser: 'Chrome', os: 'Windows', kind: 'desktop' }]);
  });

  it('alerts once per new kind of device, and the alert names it in the list', async () => {
    const me = await registerAndLogin(app);
    await login(me, CHROME_WINDOWS);
    await login(me, SAFARI_IPHONE);
    await login(me, SAFARI_IPHONE);
    expect(await alerts(me)).toEqual([
      { browser: 'Chrome', os: 'Windows', kind: 'desktop' },
      { browser: 'Safari', os: 'iOS', kind: 'mobile' }
    ]);
    const list = (await request(app).get('/notifications').set('Authorization', `Bearer ${me.token}`)).body.notifications;
    expect(list[0]).toMatchObject({ type: 'new_login', actor_id: me.id, device: { browser: 'Safari', os: 'iOS', kind: 'mobile' } });
  });

  it('a wrong password never alerts or counts as a device', async () => {
    const me = await registerAndLogin(app);
    await request(app).post('/login').set('User-Agent', FIREFOX_LINUX).send({ email: me.email, password: 'not-the-password' });
    expect(await alerts(me)).toEqual([]);
    expect((await pool.query('SELECT count(*)::int AS n FROM known_devices WHERE user_id = $1', [me.id])).rows[0].n).toBe(1);
  });

  it('a device unused for 180 days counts as new again, and the cleanup forgets it', async () => {
    const me = await registerAndLogin(app);
    await login(me, CHROME_WINDOWS);
    await pool.query("UPDATE known_devices SET last_seen_at = now() - interval '181 days' WHERE user_id = $1 AND device_key LIKE 'Chrome|%'", [me.id]);
    await login(me, CHROME_WINDOWS);
    expect(await alerts(me)).toHaveLength(2);
    await pool.query("UPDATE known_devices SET last_seen_at = now() - interval '181 days' WHERE user_id = $1", [me.id]);
    const result = await cleanup.run();
    expect(result.knownDevices).toBe(2);
    expect((await pool.query('SELECT count(*)::int AS n FROM known_devices WHERE user_id = $1', [me.id])).rows[0].n).toBe(0);
  });

  it('emails the owner in their language when email is set up', async () => {
    jest.spyOn(email, 'emailEnabled').mockReturnValue(true);
    const sent = jest.spyOn(email, 'sendEmail').mockResolvedValue();
    const me = await registerAndLogin(app);
    await pool.query("UPDATE users SET language = 'ar' WHERE id = $1", [me.id]);
    await login(me, CHROME_WINDOWS);
    const verify = sent.mock.calls.filter(([m]) => /Verify|تأكيد/.test(m.subject)).length;
    const alert = sent.mock.calls.map(([m]) => m).filter((m) => !/Verify|تأكيد/.test(m.subject));
    expect(verify).toBeLessThanOrEqual(1);
    expect(alert).toHaveLength(1);
    expect(alert[0]).toMatchObject({ to: me.email, subject: 'تسجيل دخول جديد إلى حسابك في MySocialApp' });
    expect(alert[0].text).toContain('Chrome على Windows');
    expect(alert[0].text).toContain('/settings/sessions');
  });

  it('a failing alert never fails the login', async () => {
    const me = await registerAndLogin(app);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const notifications = require('../../services/notificationService');
    jest.spyOn(notifications, 'notifySystem').mockRejectedValue(new Error('db down'));
    const res = await login(me, SAFARI_IPHONE);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
