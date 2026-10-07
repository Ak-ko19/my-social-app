const request = require('supertest');

// Day 5: production email goes through Brevo's HTTPS API (Render's free
// tier blocks SMTP) when BREVO_API_KEY is set; SMTP stays for local dev.
const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: mockSendMail })) }));

const { setupTestApp } = require('../helpers/setupTestApp');
const { uniqueUser } = require('../helpers/auth');

const KEY = 'xkeysib-test-secret-key';
const EMAIL_VARS = ['BREVO_API_KEY', 'EMAIL_FROM', 'EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_PORT'];

describe('email delivery', () => {
  const { app, reset } = setupTestApp();
  const { sendEmail, emailProvider, parseSender } = require('../../utils/email');

  let saved;
  let fetchMock;
  let errors;
  let logs;
  let warns;
  beforeEach(async () => {
    await reset();
    saved = Object.fromEntries(EMAIL_VARS.map((k) => [k, process.env[k]]));
    for (const k of EMAIL_VARS) process.env[k] = '';
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messageId: '<m1>' }), { status: 201 }));
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    logs = jest.spyOn(console, 'log').mockImplementation(() => {});
    warns = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendMail.mockReset().mockResolvedValue({});
  });
  afterEach(() => {
    Object.assign(process.env, saved);
    jest.restoreAllMocks();
  });
  const useBrevo = () => Object.assign(process.env, { BREVO_API_KEY: KEY, EMAIL_FROM: 'MySocialApp <hello@mysocialapp.example>' });
  const logged = () => [...errors.mock.calls, ...logs.mock.calls, ...warns.mock.calls].flat().map(String).join('\n');

  it('parses the sender', () => {
    expect(parseSender('MySocialApp <hello@x.example>')).toEqual({ name: 'MySocialApp', email: 'hello@x.example' });
    expect(parseSender('"My App" <hello@x.example>')).toEqual({ name: 'My App', email: 'hello@x.example' });
    expect(parseSender('hello@x.example')).toEqual({ email: 'hello@x.example' });
    for (const bad of ['', 'MySocialApp', 'a b@c.d', '<>', undefined]) expect(parseSender(bad)).toBeNull();
  });

  it('picks Brevo over SMTP, SMTP for local dev, nothing when unset', () => {
    expect(emailProvider({})).toBeNull();
    expect(emailProvider({ EMAIL_HOST: 'h', EMAIL_USER: 'u', EMAIL_PASS: 'p' })).toBe('smtp');
    expect(emailProvider({ BREVO_API_KEY: 'k', EMAIL_HOST: 'h', EMAIL_USER: 'u', EMAIL_PASS: 'p' })).toBe('brevo');
  });

  describe('Brevo', () => {
    it('sends the documented request and reports success', async () => {
      useBrevo();
      await expect(sendEmail({ to: 'ana@example.com', subject: 'Hi', text: 'Body' })).resolves.toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ 'api-key': KEY, 'content-type': 'application/json' });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(init.body)).toEqual({
        sender: { name: 'MySocialApp', email: 'hello@mysocialapp.example' },
        to: [{ email: 'ana@example.com' }],
        subject: 'Hi',
        textContent: 'Body'
      });
    });

    it('reports a refused email with Brevo\'s reason, never the key', async () => {
      useBrevo();
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), { status: 401 }));
      await expect(sendEmail({ to: 'ana@example.com', subject: 'Hi', text: 'secret link' })).resolves.toBe(false);
      expect(logged()).toMatch(/HTTP 401 unauthorized Key not found/);
      expect(logged()).not.toContain(KEY);
      expect(logged()).not.toContain('secret link');
      expect(logged()).toContain('a***@example.com');
      expect(logged()).not.toContain('ana@example.com');
    });

    it('survives network errors and timeouts', async () => {
      useBrevo();
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toBe(false);
      fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
      await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toBe(false);
      expect(logged()).toMatch(/fetch failed/);
      expect(logged()).toMatch(/timed out/);
    });

    it('does not call Brevo without a valid sender', async () => {
      useBrevo();
      process.env.EMAIL_FROM = 'not an address';
      await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(logged()).toMatch(/EMAIL_FROM must be a sender address verified in Brevo/);
    });

    it('delivers the real signup verification email', async () => {
      useBrevo();
      const creds = uniqueUser();
      expect((await request(app).post('/signup').send(creds)).status).toBe(201);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.to).toEqual([{ email: creds.email }]);
      expect(body.textContent).toMatch(/\/verify-email\/[a-f0-9]{64}/);
      expect(body.subject).toBe('Verify your MySocialApp email');
    });

    // Owner decision 2026-10-07: account emails come in the app language
    // (English or Arabic); never chosen, or anything else, = English.
    it('sends verification and reset emails in the account language', async () => {
      useBrevo();
      const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
      const ar = uniqueUser();
      expect((await request(app).post('/signup').send({ ...ar, language: 'ar' })).status).toBe(201);
      expect((await request(app).post('/forgot-password').send({ email: ar.email })).status).toBe(200);
      const [verify, reset] = sent();
      expect(verify.subject).toBe('تأكيد بريدك الإلكتروني في MySocialApp');
      expect(verify.textContent).toMatch(/^أكّد بريدك الإلكتروني: http\S+\/verify-email\/[a-f0-9]{64}\n\nتنتهي صلاحية هذا الرابط خلال 24 ساعة/);
      expect(reset.subject).toBe('إعادة تعيين كلمة مرور MySocialApp');
      expect(reset.textContent).toMatch(/^رابط إعادة التعيين: http\S+\/reset-password\/[a-f0-9]{64}\n\n/);

      // Resend uses the language saved on the account now, not at signup.
      fetchMock.mockClear();
      const login = await request(app).post('/login').send({ email: ar.email, password: ar.password });
      const auth = { Authorization: `Bearer ${login.body.token}` };
      await request(app).put('/profile/language').set(auth).send({ language: 'en' });
      expect((await request(app).post('/resend-verification').set(auth)).status).toBe(200);
      expect(sent()[0].subject).toBe('Verify your MySocialApp email');

      fetchMock.mockClear();
      const none = uniqueUser();
      await request(app).post('/signup').send({ ...none, language: 'my' });
      await request(app).post('/forgot-password').send({ email: none.email });
      expect(sent().map((m) => m.subject)).toEqual(['Verify your MySocialApp email', 'Reset your MySocialApp password']);
      expect(sent()[1].textContent).toMatch(/^Reset link: http\S+\/reset-password\/[a-f0-9]{64}\n\nThis link expires in 1 hour\./);
    });
  });

  describe('SMTP (local dev)', () => {
    it('sends through Nodemailer when only SMTP is configured', async () => {
      Object.assign(process.env, { EMAIL_HOST: 'smtp.example.com', EMAIL_USER: 'me@example.com', EMAIL_PASS: 'app-password' });
      await expect(sendEmail({ to: 'ana@example.com', subject: 'Hi', text: 'Body' })).resolves.toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith({ from: 'me@example.com', to: 'ana@example.com', subject: 'Hi', text: 'Body' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports an SMTP failure without throwing', async () => {
      Object.assign(process.env, { EMAIL_HOST: 'smtp.example.com', EMAIL_USER: 'me@example.com', EMAIL_PASS: 'app-password' });
      mockSendMail.mockRejectedValue(new Error('Connection timeout'));
      await expect(sendEmail({ to: 'ana@example.com', subject: 'Hi', text: 'Body' })).resolves.toBe(false);
      expect(logged()).toMatch(/SMTP failed.*Connection timeout/);
    });
  });

  it('returns false when no provider is configured', async () => {
    await expect(sendEmail({ to: 'a@example.com', subject: 's', text: 't' })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  describe('no provider: links never reach production logs (Day 5)', () => {
    const { maskEmail } = require('../../utils/email');
    const savedRender = process.env.RENDER;
    afterEach(() => {
      if (savedRender === undefined) delete process.env.RENDER;
      else process.env.RENDER = savedRender;
    });

    it('masks addresses', () => {
      expect(maskEmail('ana@example.com')).toBe('a***@example.com');
      expect(maskEmail('not-an-address')).toBe('***');
    });

    it('local dev prints the whole email so the link can be used', async () => {
      delete process.env.RENDER;
      await sendEmail({ to: 'ana@example.com', subject: 'Reset', text: 'Reset link: http://localhost:5173/reset-password/abc' });
      expect(logged()).toContain('/reset-password/abc');
    });

    it('production logs only that it was not sent, without the text or the address', async () => {
      process.env.RENDER = 'true';
      await expect(sendEmail({ to: 'ana@example.com', subject: 'Reset your password', text: 'Reset link: https://app/reset-password/abc' })).resolves.toBe(false);
      // Production logs are JSON lines, so the quotes arrive escaped.
      expect(logged()).toMatch(/Not sent, no email provider configured .*\\?"Reset your password\\?" to a\*\*\*@example.com/);
      expect(logged()).not.toMatch(/reset-password|abc|ana@example\.com/);
    });

    it('the real forgot-password and signup flows leak no token or link in production', async () => {
      const creds = uniqueUser();
      await request(app).post('/signup').send(creds);
      process.env.RENDER = 'true';
      errors.mockClear(); logs.mockClear(); warns.mockClear();

      // 503: reset is honestly unavailable without a provider (step 3).
      expect((await request(app).post('/forgot-password').send({ email: creds.email })).status).toBe(503);
      const other = uniqueUser();
      expect((await request(app).post('/signup').send(other)).status).toBe(201);
      const everything = logged();
      expect(everything).toMatch(/Not sent/);
      expect(everything).not.toMatch(/reset-password|verify-email|[a-f0-9]{64}/);
      expect(everything).not.toContain(creds.email);
    });
  });

  describe('no provider in production: honest, no lock-out (Day 5)', () => {
    const { pool } = require('../helpers/testDb');
    const { registerAndLogin } = require('../helpers/auth');
    const savedRender = process.env.RENDER;
    beforeEach(() => { process.env.RENDER = 'true'; });
    afterEach(() => {
      if (savedRender === undefined) delete process.env.RENDER;
      else process.env.RENDER = savedRender;
    });

    it('GET /config says whether email works', async () => {
      const off = await request(app).get('/config');
      expect(off.status).toBe(200);
      expect(off.body).toEqual({ emailEnabled: false, turnstileSiteKey: null });
      expect(off.headers['cache-control']).toBe('public, max-age=300');
      useBrevo();
      expect((await request(app).get('/config')).body).toEqual({ emailEnabled: true, turnstileSiteKey: null });
      delete process.env.RENDER; // local dev prints emails, so they "work"
      process.env.BREVO_API_KEY = '';
      expect((await request(app).get('/config')).body).toEqual({ emailEnabled: true, turnstileSiteKey: null });
    });

    it('forgot password answers every address the same 503, and writes no token', async () => {
      const user = await registerAndLogin(app);
      const known = await request(app).post('/forgot-password').send({ email: user.email });
      const unknown = await request(app).post('/forgot-password').send({ email: 'nobody@example.com' });
      for (const res of [known, unknown]) {
        expect(res.status).toBe(503);
        expect(res.text).toBe('Password reset by email is not available right now. Please try again later.');
      }
      const row = (await pool.query('SELECT reset_token FROM users WHERE id = $1', [user.id])).rows[0];
      expect(row.reset_token).toBeNull();
    });

    it('resend verification answers 503; signup and login still work unverified', async () => {
      const creds = uniqueUser();
      expect((await request(app).post('/signup').send(creds)).status).toBe(201);
      const login = await request(app).post('/login').send({ email: creds.email, password: creds.password });
      expect(login.status).toBe(200);
      expect(login.body.emailVerified).toBe(false);
      const resend = await request(app).post('/resend-verification').set('Authorization', `Bearer ${login.body.token}`);
      expect(resend.status).toBe(503);
      expect(resend.text).toBe('Email verification is not available right now.');
      // Unverified accounts can use the app (nothing requires verification).
      const post = await request(app).post('/posts').set('Authorization', `Bearer ${login.body.token}`).field('content', 'still works');
      expect(post.status).toBe(201);
    });

    it('with Brevo configured, forgot password sends the link as before', async () => {
      useBrevo();
      const user = await registerAndLogin(app);
      fetchMock.mockClear();
      const res = await request(app).post('/forgot-password').send({ email: user.email });
      expect(res.status).toBe(200);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).textContent).toMatch(/\/reset-password\/[a-f0-9]{64}/);
    });
  });

  it('warns at startup when Brevo has no usable sender', () => {
    const { checkEnv } = require('../../config/env');
    const base = { DATABASE_URL: 'postgresql://u@h/db', JWT_SECRET: 'x'.repeat(40) };
    expect(checkEnv({ ...base, BREVO_API_KEY: 'k' }).warnings.join()).toMatch(/BREVO_API_KEY is set but EMAIL_FROM/);
    expect(checkEnv({ ...base, BREVO_API_KEY: 'k', EMAIL_FROM: 'App <a@b.example>' }).warnings).toEqual([]);
  });
});
