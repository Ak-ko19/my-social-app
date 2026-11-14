const crypto = require('crypto');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const totp = require('../../utils/totp');

// Days 114-115: two-factor keys sealed at rest when TOTP_ENCRYPTION_KEY is
// set (utils/secretBox.js, services/twoFactorService.js, migration 096).
describe('two-factor keys sealed in the database', () => {
  const { app, reset } = setupTestApp();
  const errorLog = require('../../services/errorLogService');
  const KEY = crypto.randomBytes(32).toString('base64');
  const saved = process.env.TOTP_ENCRYPTION_KEY;
  const useKey = (value) => { process.env.TOTP_ENCRYPTION_KEY = value; };
  beforeEach(async () => {
    await reset();
    errorLog.resetThrottle();
    useKey(KEY);
  });
  afterEach(async () => {
    // The server errors these tests cause are written to the error log on a timer.
    await errorLog.whenIdle();
    if (saved === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = saved;
    jest.restoreAllMocks();
  });

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, path, body) => request(app).post(path).set(auth(user)).send(body);
  const code = (secret, offset = 0) => totp.codeAt(secret, Date.now() + offset * totp.STEP_SECONDS * 1000);
  const login = (user) => request(app).post('/login').send({ email: user.email, password: user.password });
  const second = (body) => request(app).post('/login/2fa').send(body);
  const stored = async (user) => (await pool.query(
    'SELECT totp_secret, totp_pending_secret, totp_enabled_at, totp_failures FROM users WHERE id = $1', [user.id]
  )).rows[0];
  const sessions = async (user) => (await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [user.id])).rows[0].n;
  // A code is accepted once per 30-second step: lets a test check again now.
  const freshStep = (user) => pool.query('UPDATE users SET totp_last_step = NULL WHERE id = $1', [user.id]);
  const SEALED = /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

  async function turnOn(user) {
    const { secret } = (await post(user, '/2fa/setup', { password: user.password })).body;
    const res = await post(user, '/2fa/enable', { code: code(secret) });
    expect(res.status).toBe(200);
    return { secret, recoveryCodes: res.body.recoveryCodes };
  }

  it('with a key: setup, turning on, logging in and turning off all work, and only sealed keys are stored', async () => {
    const me = await registerAndLogin(app);
    const setup = await post(me, '/2fa/setup', { password: me.password });
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/); // the app still gets the plain key, once
    const pending = (await stored(me)).totp_pending_secret;
    expect(pending).toMatch(SEALED);
    expect(pending).not.toContain(setup.body.secret);

    expect((await post(me, '/2fa/enable', { code: code(setup.body.secret) })).status).toBe(200);
    const on = await stored(me);
    expect(on.totp_secret).toMatch(SEALED);
    expect(on.totp_secret).not.toContain(setup.body.secret);
    expect(on.totp_pending_secret).toBeNull();

    const { challengeToken } = (await login(me)).body;
    const res = await second({ challengeToken, code: code(setup.body.secret, 1) });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));

    await freshStep(me);
    expect((await post(me, '/2fa/disable', { password: me.password, code: code(setup.body.secret, 1) })).status).toBe(200);
    expect(await stored(me)).toMatchObject({ totp_secret: null, totp_enabled_at: null });
  });

  it('a key stored before the key was set keeps working and is sealed at its next right code (not at a wrong one)', async () => {
    useKey('');
    const me = await registerAndLogin(app);
    const { secret } = await turnOn(me);
    expect((await stored(me)).totp_secret).toBe(secret);

    useKey(KEY);
    let { challengeToken } = (await login(me)).body;
    const wrong = [code(secret, -1), code(secret, 0), code(secret, 1)].includes('000000') ? '999999' : '000000';
    expect((await second({ challengeToken, code: wrong })).status).toBe(400);
    expect((await stored(me)).totp_secret).toBe(secret);

    expect((await second({ challengeToken, code: code(secret, 1) })).status).toBe(200);
    const after = (await stored(me)).totp_secret;
    expect(after).toMatch(SEALED);
    expect(after).not.toContain(secret);

    // ...and the sealed one works from then on.
    await freshStep(me);
    ({ challengeToken } = (await login(me)).body);
    expect((await second({ challengeToken, code: code(secret, 1) })).status).toBe(200);
  });

  it('a setup started before the key was set finishes sealed', async () => {
    useKey('');
    const me = await registerAndLogin(app);
    const { secret } = (await post(me, '/2fa/setup', { password: me.password })).body;
    expect((await stored(me)).totp_pending_secret).toBe(secret);
    useKey(KEY);
    expect((await post(me, '/2fa/enable', { code: code(secret) })).status).toBe(200);
    expect((await stored(me)).totp_secret).toMatch(SEALED);
  });

  it('a sealed key the server cannot open (no key, or the wrong one) is a server error: no session, 2FA stays on, no lockout', async () => {
    const me = await registerAndLogin(app);
    const { secret, recoveryCodes } = await turnOn(me);
    const before = await sessions(me);

    for (const key of ['', crypto.randomBytes(32).toString('hex')]) {
      useKey(key);
      const { challengeToken } = (await login(me)).body;
      expect(challengeToken).toEqual(expect.any(String)); // 2FA is never "off" for lack of a key
      for (let i = 0; i < 12; i++) {
        const res = await second({ challengeToken, code: code(secret, 1) });
        expect(res.status).toBe(500);
        expect(res.body.token).toBeUndefined();
      }
      expect((await post(me, '/2fa/disable', { password: me.password, code: code(secret, 1) })).status).toBe(500);
    }
    const now = await stored(me);
    expect(now.totp_enabled_at).not.toBeNull();
    expect(now.totp_secret).toMatch(SEALED);
    expect(now.totp_failures).toBe(0); // the server's fault isn't counted against the person
    expect(await sessions(me)).toBe(before);
    // A server fault, so it is in Admin > Errors (the person sees only the generic text).
    await errorLog.whenIdle();
    const logged = (await pool.query("SELECT message, status FROM error_groups WHERE message LIKE '%TOTP_ENCRYPTION_KEY%'")).rows;
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.every((row) => row.status === 500)).toBe(true);

    // A recovery code still works without the key (it never needs the app's key)...
    useKey('');
    const { challengeToken } = (await login(me)).body;
    expect((await second({ challengeToken, recoveryCode: recoveryCodes[0] })).status).toBe(200);
    // ...and with the right key back, app codes work again at once.
    useKey(KEY);
    const again = (await login(me)).body.challengeToken;
    expect((await second({ challengeToken: again, code: code(secret, 1) })).status).toBe(200);
  });

  it("a sealed key copied into another account's row does not open there", async () => {
    const ana = await registerAndLogin(app);
    const bob = await registerAndLogin(app);
    const { secret } = await turnOn(ana);
    await turnOn(bob);
    await pool.query('UPDATE users SET totp_secret = (SELECT totp_secret FROM users WHERE id = $1) WHERE id = $2', [ana.id, bob.id]);
    const { challengeToken } = (await login(bob)).body;
    const res = await second({ challengeToken, code: code(secret, 1) });
    expect(res.status).toBe(500);
    expect(res.body.token).toBeUndefined();
  });

  it('a TOTP_ENCRYPTION_KEY that is not 32 bytes never stores a plain key', async () => {
    const me = await registerAndLogin(app);
    useKey('not-a-real-key');
    expect((await post(me, '/2fa/setup', { password: me.password })).status).toBe(500);
    expect((await stored(me)).totp_pending_secret).toBeNull();
  });
});
