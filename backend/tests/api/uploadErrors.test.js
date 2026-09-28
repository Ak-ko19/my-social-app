const request = require('supertest');
const { resetDb, closeDb } = require('../helpers/testDb');
const { registerAndLogin } = require('../helpers/auth');

// Audit bug #10: a Cloudinary failure reached users as HTTP 400 with the
// provider's own text (e.g. "cloud_name is disabled"). Upload rejections
// stay 400 with our message; provider failures are 502 with generic text.
//
// Own mocks instead of setupTestApp(): Cloudinary has to be able to fail.
let mockUploadError = null;
jest.mock('../../db', () => ({ query: (...args) => require('../helpers/testDb').pool.query(...args) }));
jest.mock('../../config/cloudinary', () => {
  let seq = 0;
  return {
    uploader: {
      upload_stream: (options, callback) => ({
        end: () => {
          if (mockUploadError) return callback(mockUploadError);
          seq += 1;
          return callback(null, {
            secure_url: `https://res.cloudinary.com/test/${options.folder}/f${seq}`,
            public_id: `${options.folder}/f${seq}`
          });
        }
      })
    }
  };
});

const app = require('../../server');
const { errorHandler } = require('../../middleware/errorHandler');

const PROVIDER_TEXT = 'cloud_name is disabled';
const UPLOAD_FAILED = 'Upload failed. Please try again later.';
const png = Buffer.from('89504e470d0a1a0a', 'hex');
const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

describe('upload errors', () => {
  let user;
  let logged;
  beforeEach(async () => {
    await resetDb();
    mockUploadError = null;
    user = await registerAndLogin(app);
    logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => logged.mockRestore());
  afterAll(closeDb);

  const loggedText = () => logged.mock.calls.flat().map(String).join('\n');

  describe('when Cloudinary fails', () => {
    beforeEach(() => {
      mockUploadError = new Error(PROVIDER_TEXT);
    });

    it('post images: 502, generic text, provider error only in the log, no post created', async () => {
      const res = await request(app).post('/posts').set(auth(user)).field('content', 'hi').attach('images', png, { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(502);
      expect(res.text).toBe(UPLOAD_FAILED);
      expect(loggedText()).toContain(PROVIDER_TEXT);
      const mine = await request(app).get(`/users/${user.id}/posts?tab=posts`).set(auth(user));
      expect(mine.body.posts || mine.body).toHaveLength(0);
    });

    it('avatar: 502 with generic text', async () => {
      const res = await request(app).put('/profile').set(auth(user)).field('username', user.username).field('email', user.email)
        .attach('avatar', png, { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(502);
      expect(res.text).toBe(UPLOAD_FAILED);
    });

    it('voice message: 502 with generic text', async () => {
      const other = await registerAndLogin(app);
      const conv = (await request(app).post('/conversations').set(auth(user)).send({ userId: other.id })).body;
      const res = await request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(user))
        .attach('audio', Buffer.from('OggS'), { filename: 'v.ogg', contentType: 'audio/ogg' });
      expect(res.status).toBe(502);
      expect(res.text).toBe(UPLOAD_FAILED);
      expect(res.text).not.toContain(PROVIDER_TEXT);
    });
  });

  it('still uploads normally when Cloudinary works', async () => {
    const res = await request(app).post('/posts').set(auth(user)).field('content', 'hi').attach('images', png, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
  });

  describe('rejected uploads (400, message shown)', () => {
    it('wrong image type', async () => {
      const res = await request(app).post('/posts').set(auth(user)).field('content', 'hi')
        .attach('images', Buffer.from('#!/bin/sh'), { filename: 'x.sh', contentType: 'application/x-sh' });
      expect(res.status).toBe(400);
      expect(res.text).toBe('Only JPEG, PNG, GIF, and WEBP images are allowed');
    });

    it('wrong audio type', async () => {
      const other = await registerAndLogin(app);
      const conv = (await request(app).post('/conversations').set(auth(user)).send({ userId: other.id })).body;
      const res = await request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(user))
        .attach('audio', png, { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
      expect(res.text).toBe('Only WEBM, MP4, OGG, and MPEG audio files are allowed');
    });

    it('file over 5 MB', async () => {
      const big = Buffer.alloc(5 * 1024 * 1024 + 1);
      const res = await request(app).post('/posts').set(auth(user)).field('content', 'hi').attach('images', big, { filename: 'big.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
      expect(res.text).toBe('File is too large (max 5 MB)');
    });

    it('more than 10 images', async () => {
      let req = request(app).post('/posts').set(auth(user)).field('content', 'hi');
      for (let i = 0; i < 11; i += 1) req = req.attach('images', png, { filename: `${i}.png`, contentType: 'image/png' });
      const res = await req;
      expect(res.status).toBe(400);
      expect(res.text).toBe('You can attach up to 10 images');
    });
  });

  it('answers a disallowed browser origin with 403', async () => {
    const res = await request(app).get('/').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.text).toBe('Not allowed by CORS');
  });

  it('keeps malformed JSON a 400', async () => {
    const res = await request(app).post('/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
  });
});

describe('errorHandler', () => {
  function run(err, { headersSent = false } = {}) {
    const res = { headersSent, statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.send = (body) => { res.body = body; return res; };
    const next = jest.fn();
    errorHandler(err, { method: 'GET', path: '/x' }, res, next);
    return { res, next };
  }

  it('answers anything unexpected with a generic 500 and logs the real error', () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { res } = run(new Error('relation "secret_table" does not exist'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('Something went wrong. Please try again later.');
    expect(logged.mock.calls.flat().map(String).join(' ')).toContain('secret_table');
    logged.mockRestore();
  });

  it('never exposes a 4xx/5xx status without expose', () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('internal detail'), { status: 400 });
    expect(run(err).res.body).toBe('Something went wrong. Please try again later.');
    logged.mockRestore();
  });

  it('hands off to Express once the response has started', () => {
    const err = new Error('late');
    const { res, next } = run(err, { headersSent: true });
    expect(next).toHaveBeenCalledWith(err);
    expect(res.statusCode).toBeNull();
  });
});
