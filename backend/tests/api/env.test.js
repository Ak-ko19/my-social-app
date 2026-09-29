const path = require('path');
const { spawn } = require('child_process');
const { checkEnv } = require('../../config/env');

// Day 3: the server checks its environment at startup and refuses to run
// with a clear message instead of failing later (audit bug #7).
const BASE = {
  DATABASE_URL: 'postgresql://user:pass@db.example.com/app?sslmode=require',
  JWT_SECRET: 'a'.repeat(64)
};
const PROD = {
  ...BASE,
  RENDER: 'true',
  ALLOWED_ORIGINS: 'https://my-app.vercel.app',
  FRONTEND_URL: 'https://my-app.vercel.app',
  CLOUDINARY_CLOUD_NAME: 'c',
  CLOUDINARY_API_KEY: 'k',
  CLOUDINARY_API_SECRET: 's',
  CLEANUP_SECRET: 'c'.repeat(64)
};

const errorsOf = (env) => checkEnv(env).errors.join('\n');
const warningsOf = (env) => checkEnv(env).warnings.join('\n');

describe('checkEnv', () => {
  it('accepts a minimal local setup and a complete production one', () => {
    expect(checkEnv(BASE)).toEqual({ errors: [], warnings: [] });
    expect(checkEnv(PROD)).toEqual({ errors: [], warnings: [] });
    expect(checkEnv({ ...PROD, RENDER: undefined, NODE_ENV: 'production' })).toEqual({ errors: [], warnings: [] });
  });

  it('requires DATABASE_URL as a PostgreSQL URL', () => {
    expect(errorsOf({ ...BASE, DATABASE_URL: undefined })).toMatch(/DATABASE_URL is not set/);
    expect(errorsOf({ ...BASE, DATABASE_URL: '   ' })).toMatch(/DATABASE_URL is not set/);
    expect(errorsOf({ ...BASE, DATABASE_URL: 'mysql://u@h/db' })).toMatch(/DATABASE_URL must start with postgresql/);
    expect(errorsOf({ ...BASE, DATABASE_URL: 'postgres://u@h/db' })).toBe('');
  });

  it('requires JWT_SECRET, and warns about a short one in production only', () => {
    expect(errorsOf({ ...BASE, JWT_SECRET: '' })).toMatch(/JWT_SECRET is not set/);
    expect(warningsOf({ ...PROD, JWT_SECRET: 'short' })).toMatch(/JWT_SECRET is shorter than 32/);
    expect(checkEnv({ ...BASE, JWT_SECRET: 'short' }).warnings).toEqual([]);
  });

  it('never prints a secret back', () => {
    const secret = 'my-leaked-secret';
    const { errors, warnings } = checkEnv({ ...PROD, JWT_SECRET: secret, DATABASE_URL: `mysql://u:${secret}@h/db`, CLOUDINARY_API_SECRET: '' });
    expect([...errors, ...warnings].join('\n')).not.toContain(secret);
  });

  it('checks PORT when set', () => {
    for (const port of ['3000', '0', '65535', ' 8080 ']) expect(errorsOf({ ...BASE, PORT: port })).toBe('');
    for (const port of ['abc', '-1', '3000.5', '65536']) expect(errorsOf({ ...BASE, PORT: port })).toMatch(/PORT must be a whole number/);
  });

  it('reports an invalid TRUST_PROXY instead of crashing later', () => {
    expect(errorsOf({ ...BASE, TRUST_PROXY: 'true' })).toMatch(/TRUST_PROXY must be a whole number/);
  });

  it('requires ALLOWED_ORIGINS and FRONTEND_URL in production (they default to localhost)', () => {
    expect(errorsOf({ ...PROD, ALLOWED_ORIGINS: undefined })).toMatch(/ALLOWED_ORIGINS is not set/);
    expect(errorsOf({ ...PROD, FRONTEND_URL: '' })).toMatch(/FRONTEND_URL is not set/);
    expect(errorsOf(BASE)).toBe(''); // local dev: the localhost defaults are right
  });

  it('rejects origins that would silently fail CORS or build broken links', () => {
    expect(errorsOf({ ...PROD, ALLOWED_ORIGINS: 'https://my-app.vercel.app/' })).toMatch(/invalid entries: "https:\/\/my-app.vercel.app\/"/);
    expect(errorsOf({ ...PROD, ALLOWED_ORIGINS: 'https://a.com, my-app.vercel.app' })).toMatch(/"my-app.vercel.app"/);
    expect(errorsOf({ ...PROD, ALLOWED_ORIGINS: 'https://a.com,https://b.com:8443, ' })).toBe('');
    expect(errorsOf({ ...PROD, FRONTEND_URL: 'https://my-app.vercel.app/app' })).toMatch(/FRONTEND_URL must be the frontend origin/);
    expect(errorsOf({ ...PROD, FRONTEND_URL: 'ftp://my-app.vercel.app' })).toMatch(/FRONTEND_URL must be/);
  });

  it('accepts backend/.env.example as written, so the docs match the check', () => {
    const example = require('dotenv').parse(require('fs').readFileSync(path.join(__dirname, '../../.env.example')));
    expect(checkEnv(example).errors).toEqual([]);
  });

  it('warns (without refusing to start) about partial or missing upload/email setup', () => {
    expect(warningsOf({ ...BASE, CLOUDINARY_CLOUD_NAME: 'c' })).toMatch(/Cloudinary is only partly configured \(missing CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET\)/);
    expect(warningsOf({ ...PROD, CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' })).toMatch(/Cloudinary is not configured/);
    expect(checkEnv(BASE).warnings).toEqual([]); // local dev without uploads is normal
    expect(warningsOf({ ...BASE, EMAIL_HOST: 'smtp.example.com' })).toMatch(/Email is only partly configured \(missing EMAIL_USER, EMAIL_PASS\)/);
    expect(checkEnv({ ...PROD, CLOUDINARY_API_KEY: '' }).errors).toEqual([]);
  });
});

describe('node server.js', () => {
  // Every variable the app reads is set explicitly (blank = unset), so a
  // developer's backend/.env can't change the outcome: dotenv never
  // overrides a variable that is already set.
  const CLEAN = {
    NODE_ENV: 'development', RENDER: '', TRUST_PROXY: '', PORT: '0',
    DATABASE_URL: 'postgresql://nobody@localhost:1/none', JWT_SECRET: 'x'.repeat(40),
    ALLOWED_ORIGINS: '', FRONTEND_URL: '',
    CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
    BREVO_API_KEY: '', SENTRY_DSN: '', CLEANUP_SECRET: '', EMAIL_HOST: '', EMAIL_USER: '', EMAIL_PASS: '', EMAIL_FROM: '', EMAIL_PORT: ''
  };

  // Resolves once the process exits or prints its "running" line.
  function startServer(env) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, ...CLEAN, ...env }
      });
      let out = '';
      const collect = (chunk) => {
        out += chunk;
        const running = out.match(/Server is running on port (\d+)/);
        if (running) {
          child.kill();
          resolve({ running: true, port: Number(running[1]), out });
        }
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.on('exit', (code) => resolve({ running: false, code, out }));
    });
  }

  it('refuses to start without JWT_SECRET and says why', async () => {
    const result = await startServer({ JWT_SECRET: '' });
    expect(result.running).toBe(false);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/The server can't start/);
    expect(result.out).toMatch(/JWT_SECRET is not set/);
  }, 20000);

  it('lists every problem at once on a half-configured Render service', async () => {
    const result = await startServer({ RENDER: 'true', DATABASE_URL: '' });
    expect(result.code).toBe(1);
    for (const name of ['DATABASE_URL', 'ALLOWED_ORIGINS', 'FRONTEND_URL']) {
      expect(result.out).toContain(`${name} is not set`);
    }
    expect(result.out).toMatch(/Warning: Cloudinary is not configured/);
  }, 20000);

  it('starts on the port from PORT', async () => {
    // 0 = "any free port": proves PORT is honoured (not the 3000 default)
    // and can't collide with a dev server already on 3000.
    const result = await startServer({ PORT: '0' });
    expect(result.running).toBe(true);
    expect(result.port).toBeGreaterThan(0);
    expect(result.port).not.toBe(3000);
    expect(result.out).not.toMatch(/Warning|can't start/);
  }, 20000);
});
