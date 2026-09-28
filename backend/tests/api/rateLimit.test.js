const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { uniqueUser } = require('../helpers/auth');

// Audit bug #1: behind Render's proxy every client shared one limiter
// bucket, and no test caught it because limiters are off under
// NODE_ENV=test. This file runs the REAL limiters (RATE_LIMIT_IN_TESTS)
// with the production proxy setting (RENDER=true -> trust 1 hop), and
// simulates clients with X-Forwarded-For, as Render's proxy would send it.
const savedEnv = { RATE_LIMIT_IN_TESTS: process.env.RATE_LIMIT_IN_TESTS, RENDER: process.env.RENDER };
process.env.RATE_LIMIT_IN_TESTS = '1';
process.env.RENDER = 'true';

describe('rate limiting with real limiters', () => {
  const { app, reset } = setupTestApp();

  // One reset for the whole file, not per test: the limiters' in-memory
  // counters live as long as the app, so every case below uses its own IPs
  // and users, and user IDs must not repeat.
  beforeAll(reset);
  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // Each user signs up from their own IP (signup is limited to 10/h per IP).
  let signupIp = 0;
  async function createUser() {
    const creds = uniqueUser();
    signupIp += 1;
    const res = await request(app).post('/signup').set('X-Forwarded-For', `192.0.2.${signupIp}`).send(creds);
    expect(res.status).toBe(201);
    const login = await request(app)
      .post('/login')
      .set('X-Forwarded-For', `192.0.2.${signupIp}`)
      .send({ email: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    return { ...creds, id: login.body.id, token: login.body.token };
  }

  const login = (ip, email, password, token) => {
    const req = request(app).post('/login').set('X-Forwarded-For', ip);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ email, password });
  };

  it('7 users on 7 networks mistyping a password do not block each other', async () => {
    const users = [];
    for (let i = 0; i < 7; i += 1) users.push(await createUser());

    for (const [i, user] of users.entries()) {
      const res = await login(`203.0.113.${i + 1}`, user.email, 'wrong-password');
      expect(res.status).toBe(401);
    }
    for (const [i, user] of users.entries()) {
      const res = await login(`203.0.113.${i + 1}`, user.email, user.password);
      expect(res.status).toBe(200);
    }
  });

  it('locks one network out of login after 5 wrong passwords, and only that network', async () => {
    const victim = await createUser();
    const a = await createUser();
    const b = await createUser();

    for (let i = 0; i < 5; i += 1) {
      expect((await login('198.51.100.10', victim.email, 'guess', a.token)).status).toBe(401);
    }
    const blocked = await login('198.51.100.10', victim.email, 'guess', a.token);
    expect(blocked.status).toBe(429);
    expect(blocked.text).toBe('Too many login attempts. Please try again in 15 minutes.');
    expect(blocked.headers['retry-after']).toBe('900');

    // Switching to another account's token must not reset the counter.
    expect((await login('198.51.100.10', victim.email, victim.password, b.token)).status).toBe(429);
    // The real owner, on their own network, is not locked out.
    expect((await login('198.51.100.11', victim.email, victim.password)).status).toBe(200);
  });

  it('ignores spoofed X-Forwarded-For entries a client prepends', async () => {
    const victim = await createUser();
    for (let i = 0; i < 5; i += 1) {
      const res = await login(`10.0.0.${i}, 198.51.100.20`, victim.email, 'guess');
      expect(res.status).toBe(401);
    }
    expect((await login('10.0.0.99, 198.51.100.20', victim.email, 'guess')).status).toBe(429);
  });

  it('gives each logged-in user their own global budget, even on a shared network', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const sharedIp = '198.51.100.30';
    const get = (ip, token) => {
      const req = request(app).get('/').set('X-Forwarded-For', ip);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    // Her signup/login in createUser carried no token, so they counted
    // against that IP, not her: all 300 of her requests are still left.
    for (let i = 0; i < 300; i += 1) {
      const res = await get(sharedIp, alice.token);
      if (res.status !== 200) throw new Error(`request ${i + 1} got ${res.status}`);
    }
    const blocked = await get(sharedIp, alice.token);
    expect(blocked.status).toBe(429);
    expect(blocked.text).toBe('Too many requests. Please try again later.');
    // The budget follows the account, not the network...
    expect((await get('198.51.100.31', alice.token)).status).toBe(429);
    // ...so other people on the same network are unaffected.
    expect((await get(sharedIp, bob.token)).status).toBe(200);
    expect((await get(sharedIp)).status).toBe(200);
    // A forged token counts against the network's IP bucket, not a new user.
    expect((await get(sharedIp, 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjk5OX0.forged')).status).toBe(200);
  });

  it('limits follows per user, whatever network they use', async () => {
    const spammer = await createUser();
    const other = await createUser();
    const target = await createUser();
    const follow = (ip, user) => request(app)
      .post(`/users/${target.id}/follow`)
      .set('X-Forwarded-For', ip)
      .set('Authorization', `Bearer ${user.token}`);

    for (let i = 0; i < 60; i += 1) {
      const res = await follow(`198.51.100.${100 + (i % 50)}`, spammer);
      // 201 the first time, then 400 "already following"; both count.
      expect(res.status).not.toBe(429);
    }
    const blocked = await follow('198.51.100.200', spammer);
    expect(blocked.status).toBe(429);
    expect(blocked.text).toBe('Too many follow requests. Please try again later.');
    expect((await follow('198.51.100.200', other)).status).toBe(201);
  });
});

describe('rate limiting switch', () => {
  it('stays off under NODE_ENV=test unless RATE_LIMIT_IN_TESTS=1, so other suites are unaffected', () => {
    const saved = process.env.RATE_LIMIT_IN_TESTS;
    delete process.env.RATE_LIMIT_IN_TESTS;
    try {
      let createLimiter;
      jest.isolateModules(() => {
        ({ createLimiter } = require('../../middleware/rateLimiter'));
      });
      const limiter = createLimiter({ keyBy: 'ip', windowMs: 60000, max: 1, message: 'x' });
      const next = jest.fn();
      for (let i = 0; i < 3; i += 1) limiter({ ip: '203.0.113.9', headers: {} }, {}, next);
      expect(next).toHaveBeenCalledTimes(3);
    } finally {
      if (saved === undefined) delete process.env.RATE_LIMIT_IN_TESTS;
      else process.env.RATE_LIMIT_IN_TESTS = saved;
    }
  });
});
