const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { uniqueUser } = require('../helpers/auth');
const { turnstileSiteKey, verifyTurnstile, TURNSTILE_NEEDED } = require('../../services/turnstile');

// Day 11 step 2: the optional Turnstile check. Cloudflare is never called:
// global fetch is replaced for the siteverify request.
const realFetch = global.fetch;
let verifyCalls;
let answer; // what the fake Cloudflare does: { success } | 'down' | 'http500'

beforeEach(() => {
  verifyCalls = [];
  answer = { success: true };
  global.fetch = jest.fn(async (url, options) => {
    verifyCalls.push({ url, body: JSON.parse(options.body) });
    if (answer === 'down') throw new Error('network down');
    if (answer === 'http500') return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => answer };
  });
});
afterEach(() => {
  global.fetch = realFetch;
  process.env.TURNSTILE_SITE_KEY = '';
  process.env.TURNSTILE_SECRET_KEY = '';
});

const turnOn = () => {
  process.env.TURNSTILE_SITE_KEY = 'site-key-public';
  process.env.TURNSTILE_SECRET_KEY = 'secret-key-private';
};

describe('turnstile switch', () => {
  it('is on only with both keys', () => {
    expect(turnstileSiteKey({})).toBeNull();
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: 'a' })).toBeNull();
    expect(turnstileSiteKey({ TURNSTILE_SECRET_KEY: 'b' })).toBeNull();
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: ' a ', TURNSTILE_SECRET_KEY: 'b' })).toBe('a');
  });

  it('asks Cloudflare, with the secret, the token and the client IP', async () => {
    const env = { TURNSTILE_SITE_KEY: 'a', TURNSTILE_SECRET_KEY: 'sec' };
    expect(await verifyTurnstile('tok', '203.0.113.5', env)).toBe('ok');
    expect(verifyCalls[0]).toEqual({
      url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      body: { secret: 'sec', response: 'tok', remoteip: '203.0.113.5' }
    });
    answer = { success: false, 'error-codes': ['invalid-input-response'] };
    expect(await verifyTurnstile('tok', '203.0.113.5', env)).toBe('failed');
    answer = 'down';
    expect(await verifyTurnstile('tok', '203.0.113.5', env)).toBe('unavailable');
    answer = 'http500';
    expect(await verifyTurnstile('tok', '203.0.113.5', env)).toBe('unavailable');
  });

  it('only honours the verify-URL override outside production', async () => {
    const env = { TURNSTILE_SECRET_KEY: 'sec', TURNSTILE_VERIFY_URL: 'http://localhost:3901/siteverify' };
    await verifyTurnstile('tok', '1.2.3.4', env);
    await verifyTurnstile('tok', '1.2.3.4', { ...env, RENDER: 'true' });
    expect(verifyCalls.map((c) => c.url)).toEqual([
      'http://localhost:3901/siteverify',
      'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    ]);
  });
});

describe('turnstile on the routes', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('off (no keys): signup works with no token, Cloudflare is never asked, /config says null', async () => {
    expect((await request(app).post('/signup').send(uniqueUser())).status).toBe(201);
    expect(verifyCalls).toHaveLength(0);
    expect((await request(app).get('/config')).body).toEqual({ emailEnabled: true, turnstileSiteKey: null });
  });

  it('on: /config hands out the site key only (never the secret)', async () => {
    turnOn();
    const res = await request(app).get('/config');
    expect(res.body.turnstileSiteKey).toBe('site-key-public');
    expect(res.text).not.toContain('secret-key-private');
  });

  it('on: signup and forgot password need a token Cloudflare accepts', async () => {
    turnOn();
    for (const [path, body] of [['/signup', uniqueUser()], ['/forgot-password', { email: 'a@example.com' }]]) {
      const missing = await request(app).post(path).send(body);
      expect(missing.status).toBe(400);
      expect(missing.text).toBe(TURNSTILE_NEEDED);

      const huge = await request(app).post(path).send({ ...body, turnstileToken: 'x'.repeat(2049) });
      expect(huge.status).toBe(400);

      answer = { success: false };
      const rejected = await request(app).post(path).send({ ...body, turnstileToken: 'bad' });
      expect(rejected.status).toBe(400);
      expect(rejected.text).toBe(TURNSTILE_NEEDED);

      answer = { success: true };
      const ok = await request(app).post(path).send({ ...body, turnstileToken: 'good' });
      expect([200, 201]).toContain(ok.status);
    }
    // Only the two well-formed tokens per route reached Cloudflare.
    expect(verifyCalls.map((c) => c.body.response)).toEqual(['bad', 'good', 'bad', 'good']);
  });

  it('on: login is not affected (password managers, future mobile app)', async () => {
    const creds = uniqueUser();
    expect((await request(app).post('/signup').send(creds)).status).toBe(201);
    turnOn();
    expect((await request(app).post('/login').send({ email: creds.email, password: creds.password })).status).toBe(200);
    expect(verifyCalls).toHaveLength(0);
  });

  it('on: if Cloudflare cannot be reached, lets the signup through (fail open)', async () => {
    turnOn();
    answer = 'down';
    expect((await request(app).post('/signup').send({ ...uniqueUser(), turnstileToken: 'any' })).status).toBe(201);
  });
});
