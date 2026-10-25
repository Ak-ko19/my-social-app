const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const totp = require('../../utils/totp');

// Day 77, step 4: the login's second step (POST /login/2fa).
describe('logging in with two-factor authentication', () => {
  const { app, reset } = setupTestApp();
  const jwt = require('jsonwebtoken');
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());

  const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const code = (secret, offset = 0) => totp.codeAt(secret, Date.now() + offset * totp.STEP_SECONDS * 1000);
  const login = (user, ua = 'jest') => request(app).post('/login').set('User-Agent', ua).send({ email: user.email, password: user.password });
  const second = (body, ua = 'jest') => request(app).post('/login/2fa').set('User-Agent', ua).send(body);
  const sessions = async (user) => (await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [user.id])).rows[0].n;
  const wrongCode = (secret) => ([code(secret, -1), code(secret, 0), code(secret, 1)].includes('000000') ? '999999' : '000000');
  const EXPIRED = 'Your login has expired. Please log in again.';

  async function withTwoFactor() {
    const me = await registerAndLogin(app);
    const { secret } = (await request(app).post('/2fa/setup').set(auth(me.token)).send({ password: me.password })).body;
    const recoveryCodes = (await request(app).post('/2fa/enable').set(auth(me.token)).send({ code: code(secret) })).body.recoveryCodes;
    return { me, secret, recoveryCodes };
  }

  it('a right password alone gives a challenge, not a session', async () => {
    const { me } = await withTwoFactor();
    const before = await sessions(me);
    const res = await login(me);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ twoFactorRequired: true, challengeToken: expect.any(String) });
    expect(await sessions(me)).toBe(before);
    // A wrong password is still just a wrong password.
    expect((await request(app).post('/login').send({ email: me.email, password: 'wrong-password-1' })).status).toBe(401);
  });

  it('the challenge and a code log in, once', async () => {
    const { me, secret } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    const res = await second({ challengeToken, code: code(secret, 1) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: me.id, username: me.username, token: expect.any(String) });
    expect(res.body.recoveryCodesLeft).toBeUndefined();
    expect((await request(app).get('/2fa').set(auth(res.body.token))).status).toBe(200);
    // The same code can't log in a second time (with a new challenge: the
    // old one is spent since Day 92).
    const again = await second({ challengeToken: (await login(me)).body.challengeToken, code: code(secret, 1) });
    expect(again.status).toBe(400);
    expect(again.text).toBe('That code was already used. Wait for the next one in your app.');
  });

  it('wrong, missing or foreign codes and tokens are refused', async () => {
    const { me, secret } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    expect((await second({ challengeToken, code: wrongCode(secret) })).text)
      .toBe('That code is not right. Check that the time on your phone is correct and try again.');
    expect((await second({ challengeToken })).text).toBe('Enter the 6-digit code from your authenticator app.');
    expect((await second({ code: code(secret, 1) })).text).toBe(EXPIRED);
    expect((await second({ challengeToken: { a: 1 }, code: code(secret, 1) })).status).toBe(400);
    // A session token is not a challenge, and a challenge is not a session.
    expect((await second({ challengeToken: me.token, code: code(secret, 1) })).text).toBe(EXPIRED);
    expect((await request(app).get('/2fa').set(auth(challengeToken))).status).toBe(401);
    // Signed with the session key instead of the challenge key: refused.
    const forged = jwt.sign({ uid: me.id, purpose: '2fa' }, process.env.JWT_SECRET, { expiresIn: 300 });
    expect((await second({ challengeToken: forged, code: code(secret, 1) })).text).toBe(EXPIRED);
  });

  it('the challenge ends after 5 minutes, on a password change, or when 2FA is turned off', async () => {
    const { me, secret } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 6 * 60 * 1000);
    expect((await second({ challengeToken, code: totp.codeAt(secret, realNow + 6 * 60 * 1000) })).text).toBe(EXPIRED);
    Date.now.mockRestore();

    const fresh = (await login(me)).body.challengeToken;
    await request(app).put('/profile/password').set(auth(me.token)).send({ currentPassword: me.password, newPassword: 'another-password-9' });
    expect((await second({ challengeToken: fresh, code: code(secret, 1) })).text).toBe(EXPIRED);

    me.password = 'another-password-9';
    const third = (await login(me)).body.challengeToken;
    await pool.query('UPDATE users SET totp_enabled_at = NULL, totp_secret = NULL WHERE id = $1', [me.id]);
    expect((await second({ challengeToken: third, code: code(secret, 1) })).text).toBe(EXPIRED);
  });

  it('a recovery code logs in and says how many are left', async () => {
    const { me, recoveryCodes } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    const res = await second({ challengeToken, recoveryCode: recoveryCodes[3] });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodesLeft).toBe(9);
    const fresh = (await login(me)).body.challengeToken;
    expect((await second({ challengeToken: fresh, recoveryCode: recoveryCodes[3] })).text).toBe('That recovery code is not right, or it was already used.');
  });

  // Day 92 (AUDIT_REPORT_4 B3): one challenge, one login.
  it('a challenge logs in once, even with a fresh code or a recovery code -- and spends nothing the second time', async () => {
    const { me, secret, recoveryCodes } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    expect((await second({ challengeToken, code: code(secret, 1) })).status).toBe(200);
    const before = await sessions(me);
    expect((await second({ challengeToken, code: code(secret, 0) })).text).toBe(EXPIRED);
    expect((await second({ challengeToken, recoveryCode: recoveryCodes[0] })).text).toBe(EXPIRED);
    expect(await sessions(me)).toBe(before);
    // The recovery code wasn't spent on the refused try.
    const next = (await login(me)).body.challengeToken;
    const res = await second({ challengeToken: next, recoveryCode: recoveryCodes[0] });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodesLeft).toBe(9);
  });

  it('two racing logins with one challenge: exactly one gets in', async () => {
    const { me, secret, recoveryCodes } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    const before = await sessions(me);
    const results = await Promise.all([
      second({ challengeToken, code: code(secret, 1) }),
      second({ challengeToken, recoveryCode: recoveryCodes[1] }),
      second({ challengeToken, recoveryCode: recoveryCodes[2] })
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400).every((r) => r.text === EXPIRED)).toBe(true);
    expect(await sessions(me)).toBe(before + 1);
  });

  it('a reuse that slips past the first check (a race between instances) is refused by the database', async () => {
    const { me, secret, recoveryCodes } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    expect((await second({ challengeToken, code: code(secret, 1) })).status).toBe(200);
    // What a racing request sees: the first login's session not there yet.
    const db = require('../../db');
    const realQuery = db.query;
    jest.spyOn(db, 'query').mockImplementation((text, ...rest) =>
      (String(text).startsWith('SELECT 1 FROM sessions WHERE login_challenge') ? Promise.resolve({ rows: [] }) : realQuery(text, ...rest)));
    const before = await sessions(me);
    const res = await second({ challengeToken, recoveryCode: recoveryCodes[5] });
    expect(res.status).toBe(400);
    expect(res.text).toBe(EXPIRED);
    expect(await sessions(me)).toBe(before);
  });

  it('two devices, two challenges: both log in; a wrong code first is fine', async () => {
    const { me, secret, recoveryCodes } = await withTwoFactor();
    const phone = (await login(me, SAFARI_IPHONE)).body.challengeToken;
    const laptop = (await login(me)).body.challengeToken;
    expect((await second({ challengeToken: laptop, code: wrongCode(secret) })).status).toBe(400);
    expect((await second({ challengeToken: laptop, code: code(secret, 1) })).status).toBe(200);
    expect((await second({ challengeToken: phone, recoveryCode: recoveryCodes[4] }, SAFARI_IPHONE)).status).toBe(200);
  });

  it('a challenge without an id (made before Day 92) is refused', async () => {
    const { me, secret } = await withTwoFactor();
    const real = jwt.decode((await login(me)).body.challengeToken);
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('not-a-uuid');
    const odd = (await login(me)).body.challengeToken;
    expect(jwt.decode(odd).jti).toBe('not-a-uuid');
    expect((await second({ challengeToken: odd, code: code(secret, 1) })).text).toBe(EXPIRED);
    expect(real.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('10 wrong codes lock the code step for 15 minutes', async () => {
    const { me, secret } = await withTwoFactor();
    const { challengeToken } = (await login(me)).body;
    for (let i = 0; i < 10; i++) expect((await second({ challengeToken, code: wrongCode(secret) })).status).toBe(400);
    const locked = await second({ challengeToken, code: code(secret, 1) });
    expect(locked.status).toBe(429);
    expect(locked.text).toBe('Too many wrong codes. Please wait 15 minutes and try again.');
  });

  it('reactivation, the login alert and bans wait for the second step', async () => {
    const { me, secret } = await withTwoFactor();
    await pool.query('UPDATE users SET is_deactivated = true, deactivated_at = now() WHERE id = $1', [me.id]);
    const { challengeToken } = (await login(me, SAFARI_IPHONE)).body;
    const alerts = async () => (await pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'new_login'", [me.id])).rows[0].n;
    expect((await pool.query('SELECT is_deactivated FROM users WHERE id = $1', [me.id])).rows[0].is_deactivated).toBe(true);
    expect(await alerts()).toBe(0);
    const res = await second({ challengeToken, code: code(secret, 1) }, SAFARI_IPHONE);
    expect(res.body.reactivated).toBe(true);
    expect(await alerts()).toBe(1);

    // Banned between the two steps: refused.
    const next = (await login(me)).body.challengeToken;
    await pool.query('UPDATE users SET banned_at = now() WHERE id = $1', [me.id]);
    const banned = await second({ challengeToken: next, code: code(secret, 2) });
    expect(banned.status).toBe(403);
    expect(banned.text).toBe('This account has been banned');
    // And a banned account's password gets no challenge either.
    expect((await login(me)).status).toBe(403);
  });
});
