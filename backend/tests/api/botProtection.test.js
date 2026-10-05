const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { uniqueUser, registerAndLogin } = require('../helpers/auth');
const bot = require('../../services/botProtection');

// Day 11. The checks are off under NODE_ENV=test (so the other suites need
// no form tokens); this file turns them on.
const saved = process.env.BOT_CHECKS_IN_TESTS;
beforeAll(() => {
  process.env.BOT_CHECKS_IN_TESTS = '1';
});
afterAll(() => {
  if (saved === undefined) delete process.env.BOT_CHECKS_IN_TESTS;
  else process.env.BOT_CHECKS_IN_TESTS = saved;
});
beforeEach(() => bot.resetLoginThrottle());

const aged = (ms) => bot.issueFormToken(Date.now() - ms);

describe('form tokens', () => {
  it('accepts a token old enough, refuses one too young', () => {
    const now = Date.now();
    const token = bot.issueFormToken(now);
    expect(bot.checkFormToken(token, 3000, now + 1000)).toBe(bot.TOO_FAST);
    expect(bot.checkFormToken(token, 3000, now + 3000)).toBeNull();
  });

  it('refuses missing, malformed, forged, future and expired tokens', () => {
    const now = Date.now();
    const good = bot.issueFormToken(now - 5000);
    const [issued, mac] = good.split('.');
    // A forged signature: its FIRST character swapped for a different one.
    // (Day 30: replacing the last one with 'A' was the real signature
    // whenever it already ended in 'A' -- 1 run in 16 -- because base64's
    // last character only carries 4 bits. The first carries a full 6.)
    const forged = `${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`;
    for (const token of [undefined, 42, '', 'abc', `${issued}.`, `.${mac}`, `${Number(issued) - 1}.${mac}`, `${issued}.${mac}x`, `${issued}.${forged}`]) {
      expect(bot.checkFormToken(token, 3000, now)).toBe(bot.RELOAD);
    }
    expect(bot.checkFormToken(bot.issueFormToken(now + 60000), 0, now)).toBe(bot.RELOAD);
    expect(bot.checkFormToken(good, 0, now + 2 * 60 * 60 * 1000 + 5000)).toBe(bot.RELOAD);
  });

  it('depends on JWT_SECRET, so another deployment cannot mint tokens', () => {
    const token = aged(5000);
    const secret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'another-secret';
    try {
      expect(bot.checkFormToken(token, 3000)).toBe(bot.RELOAD);
    } finally {
      process.env.JWT_SECRET = secret;
    }
    expect(bot.checkFormToken(token, 3000)).toBeNull();
  });

  it('is off under NODE_ENV=test unless BOT_CHECKS_IN_TESTS=1', () => {
    delete process.env.BOT_CHECKS_IN_TESTS;
    try {
      expect(bot.checkFormToken(undefined, 3000)).toBeNull();
      expect(bot.honeypotTripped({ website: 'x' })).toBe(false);
      expect(bot.loginDelayMs('a@example.com')).toBe(0);
    } finally {
      process.env.BOT_CHECKS_IN_TESTS = '1';
    }
  });
});

describe('login throttle', () => {
  it('waits 0, 0, 0, then 1, 2, 4, 8, 8 s as failures pile up', () => {
    const now = Date.now();
    const delays = [];
    for (let i = 0; i < 8; i += 1) {
      delays.push(bot.loginDelayMs('Victim@Example.com', now));
      bot.recordLoginFailure(' victim@example.com ', now);
    }
    expect(delays).toEqual([0, 0, 0, 1000, 2000, 4000, 8000, 8000]);
  });

  it('forgets failures after 15 minutes, and on a successful login', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) bot.recordLoginFailure('a@example.com', now);
    expect(bot.loginDelayMs('a@example.com', now + 15 * 60 * 1000)).toBe(4000);
    expect(bot.loginDelayMs('a@example.com', now + 15 * 60 * 1000 + 1)).toBe(0);

    for (let i = 0; i < 5; i += 1) bot.recordLoginFailure('b@example.com', now);
    bot.recordLoginSuccess('B@example.com');
    expect(bot.loginDelayMs('b@example.com', now)).toBe(0);
  });

  it('keeps its memory bounded', () => {
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) bot.recordLoginFailure('first@example.com', now);
    for (let i = 0; i < bot.MAX_TRACKED; i += 1) bot.recordLoginFailure(`u${i}@example.com`, now);
    // The oldest entry made room for the newest.
    expect(bot.loginDelayMs('first@example.com', now)).toBe(0);
    expect(bot.loginDelayMs(`u${bot.MAX_TRACKED - 1}@example.com`, now)).toBe(0);
    for (let i = 0; i < 2; i += 1) bot.recordLoginFailure(`u${bot.MAX_TRACKED - 1}@example.com`, now);
    expect(bot.loginDelayMs(`u${bot.MAX_TRACKED - 1}@example.com`, now)).toBe(1000);
  });

  it('lets only a few attempts per account wait at once', async () => {
    for (let i = 0; i < 3; i += 1) bot.recordLoginFailure('c@example.com');
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: bot.MAX_WAITING + 2 }, () => bot.waitLoginTurn('c@example.com')));
    expect(results.filter(Boolean)).toHaveLength(bot.MAX_WAITING);
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    // Once they are done, the next one may wait again.
    expect(await bot.waitLoginTurn('c@example.com')).toBe(true);
  });
});

describe('bot protection on the auth routes', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  it('GET /form-token hands out a fresh, uncached token', async () => {
    const res = await request(app).get('/form-token');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(bot.checkFormToken(res.body.token, 0)).toBeNull();
  });

  it('signup needs a form token at least 3 s old', async () => {
    const missing = await request(app).post('/signup').send(uniqueUser());
    expect(missing.status).toBe(400);
    expect(missing.text).toBe(bot.RELOAD);

    const fresh = await request(app).post('/signup').send({ ...uniqueUser(), formToken: aged(500) });
    expect(fresh.status).toBe(400);
    expect(fresh.text).toBe(bot.TOO_FAST);

    const ok = await request(app).post('/signup').send({ ...uniqueUser(), formToken: aged(3000), website: '' });
    expect(ok.status).toBe(201);
  });

  it('refuses a filled-in honeypot on signup, login and forgot password', async () => {
    const user = await request(app).post('/signup').send({ ...uniqueUser(), formToken: aged(5000), website: 'http://spam.example' });
    expect(user.status).toBe(400);
    expect(user.text).toBe(bot.RELOAD);

    const creds = uniqueUser();
    expect((await request(app).post('/signup').send({ ...creds, formToken: aged(5000) })).status).toBe(201);
    const login = await request(app).post('/login').send({ email: creds.email, password: creds.password, website: 'x' });
    expect(login.status).toBe(400);
    expect(login.text).toBe(bot.RELOAD);
    // Without it (and without any form token), login works as before.
    expect((await request(app).post('/login').send({ email: creds.email, password: creds.password })).status).toBe(200);

    const forgot = await request(app).post('/forgot-password').send({ email: creds.email, formToken: aged(5000), website: 'x' });
    expect(forgot.status).toBe(400);
    expect(forgot.text).toBe(bot.RELOAD);
  });

  it('forgot password needs a form token at least 2 s old', async () => {
    const missing = await request(app).post('/forgot-password').send({ email: 'a@example.com' });
    expect(missing.status).toBe(400);
    expect(missing.text).toBe(bot.RELOAD);
    const fresh = await request(app).post('/forgot-password').send({ email: 'a@example.com', formToken: aged(1000) });
    expect(fresh.text).toBe(bot.TOO_FAST);
    // Past the guard (tests log emails instead of sending them).
    const ok = await request(app).post('/forgot-password').send({ email: 'a@example.com', formToken: aged(2000) });
    expect(ok.status).toBe(200);
  });

  it('slows login after 3 wrong passwords, then lets the owner in and forgets', async () => {
    delete process.env.BOT_CHECKS_IN_TESTS; // plain signup via the helper
    const user = await registerAndLogin(app);
    process.env.BOT_CHECKS_IN_TESTS = '1';
    const login = (password) => request(app).post('/login').send({ email: user.email, password });

    for (let i = 0; i < 3; i += 1) expect((await login('wrong-password')).status).toBe(401);
    let started = Date.now();
    expect((await login(user.password)).status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);

    // The success reset the count: no delay now.
    started = Date.now();
    expect((await login('wrong-password')).status).toBe(401);
    expect(Date.now() - started).toBeLessThan(900);
  });

  it('answers 429 when too many attempts on one account are already waiting', async () => {
    for (let i = 0; i < 3; i += 1) bot.recordLoginFailure('d@example.com');
    const results = await Promise.all(
      Array.from({ length: bot.MAX_WAITING + 1 }, () => request(app).post('/login').send({ email: 'D@example.com', password: 'guess' }))
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([...Array(bot.MAX_WAITING).fill(401), 429]);
    expect(results.find((r) => r.status === 429).text).toBe(bot.TOO_MANY_LOGINS);
  });
});
