const express = require('express');
const request = require('supertest');
const { resolveTrustProxy } = require('../../config/trustProxy');

// Audit bug #1: without `trust proxy`, every client behind Render's proxy
// shares one rate-limit bucket (req.ip is the proxy's address).
describe('resolveTrustProxy', () => {
  it('is off in local dev and tests (nothing in front of the server)', () => {
    expect(resolveTrustProxy({})).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'development' })).toBe(false);
    expect(resolveTrustProxy({ NODE_ENV: 'test' })).toBe(false);
  });

  it('trusts exactly one hop on Render or in production', () => {
    expect(resolveTrustProxy({ RENDER: 'true' })).toBe(1);
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toBe(1);
  });

  it('lets TRUST_PROXY override the default, 0 meaning off', () => {
    expect(resolveTrustProxy({ TRUST_PROXY: '2', RENDER: 'true' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: ' 1 ' })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: '0', RENDER: 'true' })).toBe(false);
    // Blank means "not set", so the platform default still applies.
    expect(resolveTrustProxy({ TRUST_PROXY: '', RENDER: 'true' })).toBe(1);
  });

  it('refuses anything that is not a hop count, including "true"', () => {
    for (const bad of ['true', 'yes', '-1', '1.5', 'loopback', '10.0.0.0/8']) {
      expect(() => resolveTrustProxy({ TRUST_PROXY: bad })).toThrow(/TRUST_PROXY must be a whole number/);
    }
  });
});

describe('server trust proxy wiring', () => {
  const saved = { RENDER: process.env.RENDER, TRUST_PROXY: process.env.TRUST_PROXY };
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function loadServer() {
    let app;
    jest.isolateModules(() => {
      jest.doMock('../../db', () => ({ query: jest.fn() }));
      app = require('../../server');
    });
    return app;
  }

  it('trusts one hop when running on Render', () => {
    process.env.RENDER = 'true';
    delete process.env.TRUST_PROXY;
    const trust = loadServer().get('trust proxy fn');
    expect(trust('10.0.0.1', 0)).toBe(true);
    expect(trust('10.0.0.2', 1)).toBe(false);
  });

  it('trusts no proxy in tests/local dev', () => {
    delete process.env.RENDER;
    delete process.env.TRUST_PROXY;
    expect(loadServer().get('trust proxy fn')('127.0.0.1', 0)).toBe(false);
  });
});

describe('client IP seen by the app', () => {
  function ipEcho(env) {
    const app = express();
    app.set('trust proxy', resolveTrustProxy(env));
    app.get('/ip', (req, res) => res.send(req.ip));
    return app;
  }

  it('uses the address the proxy appended and ignores spoofed entries', async () => {
    const res = await request(ipEcho({ RENDER: 'true' }))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
    expect(res.text).toBe('203.0.113.7');
  });

  it('gives different clients different IPs', async () => {
    const app = ipEcho({ RENDER: 'true' });
    const a = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.1');
    const b = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.2');
    expect(a.text).toBe('203.0.113.1');
    expect(b.text).toBe('203.0.113.2');
  });

  it('ignores X-Forwarded-For entirely when no proxy is trusted', async () => {
    const res = await request(ipEcho({}))
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.7');
    expect(res.text).not.toBe('203.0.113.7');
    expect(res.text).toMatch(/127\.0\.0\.1|::1/);
  });
});
