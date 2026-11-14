const crypto = require('crypto');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const totp = require('../../utils/totp');

// Days 114-115: scripts/seal-totp-secrets.js seals the two-factor keys
// stored before TOTP_ENCRYPTION_KEY was set.
describe('seal-totp-secrets script', () => {
  const { app, reset } = setupTestApp();
  // After setupTestApp, so the script gets the test database.
  const { run, parseArgs } = require('../../scripts/seal-totp-secrets');
  const db = require('../../db');
  const KEY = crypto.randomBytes(32).toString('hex');
  const saved = process.env.TOTP_ENCRYPTION_KEY;
  const useKey = (value) => { process.env.TOTP_ENCRYPTION_KEY = value; };
  beforeEach(async () => {
    await reset();
    useKey('');
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = saved;
  });

  const lines = [];
  const seal = (argv = []) => {
    lines.length = 0;
    return run({ argv, db, log: (line) => lines.push(line) });
  };
  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, path, body) => request(app).post(path).set(auth(user)).send(body);
  const code = (secret, offset = 0) => totp.codeAt(secret, Date.now() + offset * totp.STEP_SECONDS * 1000);
  const stored = async (user) => (await pool.query('SELECT totp_secret, totp_pending_secret FROM users WHERE id = $1', [user.id])).rows[0];
  const SEALED = /^v1:/;

  // Two accounts with 2FA on and one halfway through setup, all before the key.
  async function accounts() {
    const on = [];
    for (let i = 0; i < 2; i++) {
      const me = await registerAndLogin(app);
      const { secret } = (await post(me, '/2fa/setup', { password: me.password })).body;
      expect((await post(me, '/2fa/enable', { code: code(secret) })).status).toBe(200);
      on.push({ me, secret });
    }
    const pending = await registerAndLogin(app);
    const { secret } = (await post(pending, '/2fa/setup', { password: pending.password })).body;
    const none = await registerAndLogin(app);
    return { on, pending: { me: pending, secret }, none };
  }

  it('takes only --apply', () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(['--apply'])).toEqual({ apply: true });
    expect(() => parseArgs(['--help'])).toThrow(/Unknown option: --help/);
  });

  it('refuses to run without a valid key, changing nothing', async () => {
    const { on } = await accounts();
    expect(await seal(['--apply'])).toBe(2);
    expect(lines.join('\n')).toMatch(/TOTP_ENCRYPTION_KEY is not set/);
    useKey('abc');
    expect(await seal(['--apply'])).toBe(2);
    expect(lines.join('\n')).toMatch(/must be 32 random bytes/);
    expect((await stored(on[0].me)).totp_secret).toBe(on[0].secret);
  });

  it('a dry run counts; --apply seals every plain key (both columns); again changes nothing; logins still work', async () => {
    const { on, pending, none } = await accounts();
    useKey(KEY);
    expect(await seal()).toBe(0);
    expect(lines).toEqual(['3 two-factor key(s) are stored unsealed. Run with --apply to seal them.']);
    expect((await stored(on[0].me)).totp_secret).toBe(on[0].secret);

    expect(await seal(['--apply'])).toBe(0);
    expect(lines).toEqual(['Sealed 3 two-factor key(s).']);
    for (const { me, secret } of on) {
      const row = await stored(me);
      expect(row.totp_secret).toMatch(SEALED);
      expect(row.totp_secret).not.toContain(secret);
    }
    expect((await stored(pending.me)).totp_pending_secret).toMatch(SEALED);
    expect(await stored(none)).toEqual({ totp_secret: null, totp_pending_secret: null });

    expect(await seal(['--apply'])).toBe(0);
    expect(lines).toEqual(['Sealed 0 two-factor key(s).']);

    // The sealed keys work: a login with a code, and finishing the setup.
    const { challengeToken } = (await request(app).post('/login').send({ email: on[1].me.email, password: on[1].me.password })).body;
    expect((await request(app).post('/login/2fa').send({ challengeToken, code: code(on[1].secret, 1) })).status).toBe(200);
    expect((await post(pending.me, '/2fa/enable', { code: code(pending.secret) })).status).toBe(200);
  });

  it('stops, changing nothing, when keys already sealed do not open with this key', async () => {
    const { on } = await accounts();
    useKey(KEY);
    expect(await seal(['--apply'])).toBe(0);
    // A new plain key appears, and the script is run with a different key.
    await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [on[0].secret, on[0].me.id]);
    useKey(crypto.randomBytes(32).toString('hex'));
    expect(await seal(['--apply'])).toBe(1);
    expect(lines.join('\n')).toMatch(/2 key\(s\) already sealed do NOT open with this TOTP_ENCRYPTION_KEY/);
    expect((await stored(on[0].me)).totp_secret).toBe(on[0].secret);
  });
});
