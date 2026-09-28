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
  beforeEach(async () => {
    await reset();
    saved = Object.fromEntries(EMAIL_VARS.map((k) => [k, process.env[k]]));
    for (const k of EMAIL_VARS) process.env[k] = '';
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ messageId: '<m1>' }), { status: 201 }));
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    logs = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockSendMail.mockReset().mockResolvedValue({});
  });
  afterEach(() => {
    Object.assign(process.env, saved);
    jest.restoreAllMocks();
  });
  const useBrevo = () => Object.assign(process.env, { BREVO_API_KEY: KEY, EMAIL_FROM: 'MySocialApp <hello@mysocialapp.example>' });
  const logged = () => [...errors.mock.calls, ...logs.mock.calls].flat().map(String).join('\n');

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

  it('warns at startup when Brevo has no usable sender', () => {
    const { checkEnv } = require('../../config/env');
    const base = { DATABASE_URL: 'postgresql://u@h/db', JWT_SECRET: 'x'.repeat(40) };
    expect(checkEnv({ ...base, BREVO_API_KEY: 'k' }).warnings.join()).toMatch(/BREVO_API_KEY is set but EMAIL_FROM/);
    expect(checkEnv({ ...base, BREVO_API_KEY: 'k', EMAIL_FROM: 'App <a@b.example>' }).warnings).toEqual([]);
  });
});
