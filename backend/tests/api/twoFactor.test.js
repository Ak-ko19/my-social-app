const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const totp = require('../../utils/totp');

// Day 77: two-factor authentication (services/twoFactorService.js).
describe('two-factor authentication', () => {
  const { app, reset } = setupTestApp();
  const email = require('../../utils/email');
  const twoFactor = require('../../services/twoFactorService');
  beforeEach(reset);
  afterEach(() => jest.restoreAllMocks());

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, path, body) => request(app).post(path).set(auth(user)).send(body);
  const status = async (user) => (await request(app).get('/2fa').set(auth(user))).body;
  // The code the phone shows `offset` steps from now (a used step is refused,
  // so a second check in the same test plays the next step).
  const code = (secret, offset = 0) => totp.codeAt(secret, Date.now() + offset * totp.STEP_SECONDS * 1000);

  async function turnOn(user) {
    const { secret } = (await post(user, '/2fa/setup', { password: user.password })).body;
    const res = await post(user, '/2fa/enable', { code: code(secret) });
    expect(res.status).toBe(200);
    return { secret, recoveryCodes: res.body.recoveryCodes };
  }

  it('is off for a new account', async () => {
    const me = await registerAndLogin(app);
    expect(await status(me)).toEqual({ enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
  });

  it('setup needs the password and gives a key, its otpauth link and a QR code', async () => {
    const me = await registerAndLogin(app);
    expect((await post(me, '/2fa/setup', {})).status).toBe(400);
    expect((await post(me, '/2fa/setup', { password: 'wrong-password-1' })).status).toBe(403);
    const res = await post(me, '/2fa/setup', { password: me.password });
    expect(res.status).toBe(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(res.body.otpauthUrl).toBe(`otpauth://totp/MySocialApp:${me.username}?secret=${res.body.secret}&issuer=MySocialApp&algorithm=SHA1&digits=6&period=30`);
    expect(res.body.qr).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(res.body.qr.split(',')[1], 'base64').toString()).toContain('<svg');
    // Nothing is on until a code confirms the app.
    expect((await status(me)).enabled).toBe(false);
    // Starting again replaces the unfinished key.
    const again = await post(me, '/2fa/setup', { password: me.password });
    expect(again.body.secret).not.toBe(res.body.secret);
    expect((await post(me, '/2fa/enable', { code: code(res.body.secret) })).status).toBe(400);
  });

  it('turns on with a code from the app and gives 10 one-time recovery codes', async () => {
    const me = await registerAndLogin(app);
    expect((await post(me, '/2fa/enable', { code: '123456' })).text).toBe('Set up two-factor authentication first.');
    const { secret } = (await post(me, '/2fa/setup', { password: me.password })).body;
    expect((await post(me, '/2fa/enable', {})).text).toBe('Enter the 6-digit code from your authenticator app.');
    expect((await post(me, '/2fa/enable', { code: { $ne: 1 } })).status).toBe(400);
    const wrong = code(secret) === '000000' ? '111111' : '000000';
    expect((await post(me, '/2fa/enable', { code: wrong })).status).toBe(400);
    const now = code(secret);
    const res = await post(me, '/2fa/enable', { code: `${now.slice(0, 3)} ${now.slice(3)}` });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    expect(new Set(res.body.recoveryCodes).size).toBe(10);
    for (const c of res.body.recoveryCodes) expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    const after = await status(me);
    expect(after).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
    expect(new Date(after.enabledAt).getTime()).toBeGreaterThan(Date.now() - 60000);
    // Only hashes are kept.
    const stored = (await pool.query('SELECT code_hash FROM recovery_codes WHERE user_id = $1', [me.id])).rows;
    expect(stored).toHaveLength(10);
    expect(stored.map((r) => r.code_hash).join()).not.toContain(res.body.recoveryCodes[0].replace('-', ''));
    // Already on: no second setup, no second enable.
    expect((await post(me, '/2fa/setup', { password: me.password })).status).toBe(409);
    expect((await post(me, '/2fa/enable', { code: code(secret, 1) })).status).toBe(409);
  });

  it('never accepts the same code twice', async () => {
    const me = await registerAndLogin(app);
    const { secret } = await turnOn(me);
    // The code that turned it on can't turn it off.
    const used = await post(me, '/2fa/disable', { password: me.password, code: code(secret) });
    expect(used.status).toBe(400);
    expect(used.text).toBe('That code was already used. Wait for the next one in your app.');
    // Two requests racing with one new code: exactly one wins.
    const next = code(secret, 1);
    const results = await Promise.allSettled([
      twoFactor.checkSecondFactor(me.id, { code: next }),
      twoFactor.checkSecondFactor(me.id, { code: next })
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('turns off with the password and a code, and forgets the key and the recovery codes', async () => {
    const me = await registerAndLogin(app);
    const { secret } = await turnOn(me);
    expect((await post(me, '/2fa/disable', { code: code(secret, 1) })).status).toBe(400); // no password
    expect((await post(me, '/2fa/disable', { password: 'wrong-password-1', code: code(secret, 1) })).status).toBe(403);
    expect((await post(me, '/2fa/disable', { password: me.password })).text).toBe('Enter the 6-digit code from your authenticator app.');
    expect((await status(me)).enabled).toBe(true);
    expect((await post(me, '/2fa/disable', { password: me.password, code: code(secret, 1) })).body).toEqual({ ok: true });
    expect(await status(me)).toEqual({ enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
    const row = (await pool.query('SELECT totp_secret, totp_pending_secret, totp_last_step FROM users WHERE id = $1', [me.id])).rows[0];
    expect(row).toEqual({ totp_secret: null, totp_pending_secret: null, totp_last_step: null });
    expect((await pool.query('SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1', [me.id])).rows[0].n).toBe(0);
    expect((await post(me, '/2fa/disable', { password: me.password, code: code(secret, 1) })).text).toBe('Two-factor authentication is off.');
    // And it can be set up again from scratch.
    await turnOn(me);
  });

  it('a recovery code works once, typed any way, and can turn 2FA off', async () => {
    const me = await registerAndLogin(app);
    const { recoveryCodes } = await turnOn(me);
    const [first, second] = recoveryCodes;
    expect(await twoFactor.checkSecondFactor(me.id, { recoveryCode: first.toUpperCase().replace('-', ' ') })).toBe('recovery');
    expect((await status(me)).recoveryCodesLeft).toBe(9);
    await expect(twoFactor.checkSecondFactor(me.id, { recoveryCode: first })).rejects.toThrow('That recovery code is not right, or it was already used.');
    await expect(twoFactor.checkSecondFactor(me.id, { recoveryCode: 'short' })).rejects.toThrow('That recovery code');
    const res = await post(me, '/2fa/disable', { password: me.password, recoveryCode: second });
    expect(res.status).toBe(200);
    expect((await status(me)).enabled).toBe(false);
  });

  it('new recovery codes replace the old ones', async () => {
    const me = await registerAndLogin(app);
    expect((await post(me, '/2fa/recovery-codes', { password: me.password })).text).toBe('Two-factor authentication is off.');
    const { recoveryCodes: old } = await turnOn(me);
    await twoFactor.checkSecondFactor(me.id, { recoveryCode: old[0] });
    expect((await post(me, '/2fa/recovery-codes', {})).status).toBe(400);
    expect((await post(me, '/2fa/recovery-codes', { password: 'wrong-password-1' })).status).toBe(403);
    const res = await post(me, '/2fa/recovery-codes', { password: me.password });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    expect(res.body.recoveryCodes).not.toContain(old[1]);
    expect((await status(me)).recoveryCodesLeft).toBe(10);
    await expect(twoFactor.checkSecondFactor(me.id, { recoveryCode: old[1] })).rejects.toThrow('That recovery code');
    expect(await twoFactor.checkSecondFactor(me.id, { recoveryCode: res.body.recoveryCodes[0] })).toBe('recovery');
  });

  it('after 10 wrong codes in 15 minutes even the right one is refused, until the window ends', async () => {
    const me = await registerAndLogin(app);
    const { secret } = await turnOn(me);
    const now = code(secret, 1);
    const wrong = [code(secret, -1), code(secret, 0), now].includes('000000') ? '999999' : '000000';
    for (let i = 0; i < twoFactor.MAX_ATTEMPTS; i++) {
      await expect(twoFactor.checkSecondFactor(me.id, { code: wrong })).rejects.toMatchObject({ status: 400 });
    }
    const locked = await post(me, '/2fa/disable', { password: me.password, code: now });
    expect(locked.status).toBe(429);
    expect(locked.text).toBe('Too many wrong codes. Please wait 15 minutes and try again.');
    // Recovery codes count against the same limit.
    await expect(twoFactor.checkSecondFactor(me.id, { recoveryCode: 'abcde-fghij' })).rejects.toMatchObject({ status: 429 });
    await pool.query("UPDATE users SET totp_failures_since = now() - interval '16 minutes' WHERE id = $1", [me.id]);
    expect(await twoFactor.checkSecondFactor(me.id, { code: now })).toBe('app');
    expect((await pool.query('SELECT totp_failures FROM users WHERE id = $1', [me.id])).rows[0].totp_failures).toBe(0);
  });

  it('the key is never shown again and never in the data export', async () => {
    const me = await registerAndLogin(app);
    const { secret, recoveryCodes } = await turnOn(me);
    const exported = await request(app).get('/profile/export').set(auth(me));
    expect(exported.status).toBe(200);
    expect(exported.text).not.toContain(secret);
    expect(exported.text).not.toContain(recoveryCodes[0]);
    expect(JSON.parse(exported.text).profile.two_factor_enabled_at).toBeTruthy();
    expect(JSON.stringify(await status(me))).not.toContain(secret);
  });

  it('emails the owner when 2FA is turned on and off (in their language)', async () => {
    jest.spyOn(email, 'emailEnabled').mockReturnValue(true);
    const sent = jest.spyOn(email, 'sendEmail').mockResolvedValue();
    const me = await registerAndLogin(app);
    await pool.query("UPDATE users SET language = 'ar' WHERE id = $1", [me.id]);
    sent.mockClear();
    const { secret } = await turnOn(me);
    await post(me, '/2fa/disable', { password: me.password, code: code(secret, 1) });
    // The emails aren't awaited by the request.
    for (let i = 0; i < 50 && sent.mock.calls.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    expect(sent.mock.calls.map(([m]) => [m.to, m.subject])).toEqual([
      [me.email, 'تم تفعيل المصادقة الثنائية لحسابك في MySocialApp'],
      [me.email, 'تم إيقاف المصادقة الثنائية في حسابك على MySocialApp']
    ]);
  });

  it('is per account: another user cannot see or change mine', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const { secret } = await turnOn(me);
    expect((await status(other)).enabled).toBe(false);
    expect((await post(other, '/2fa/disable', { password: other.password, code: code(secret, 1) })).text).toBe('Two-factor authentication is off.');
    expect((await status(me)).enabled).toBe(true);
  });
});
