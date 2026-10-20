const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 74: a photo over 1 MB (one the web app didn't shrink) is stored at
// most 2048 px; a smaller one, and any voice note, is stored as sent.
describe('stored image size (middleware/cloudinaryUpload.js)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const cloudinary = require('../../config/cloudinary');
  const CAP = [{ width: 2048, height: 2048, crop: 'limit' }];
  const big = Buffer.alloc(1024 * 1024 + 1, 1);
  const small = Buffer.alloc(1024 * 1024, 1);
  const jpeg = (name) => ({ filename: name, contentType: 'image/jpeg' });
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

  let spy;
  beforeEach(() => { spy = jest.spyOn(cloudinary.uploader, 'upload_stream'); });
  afterEach(() => spy.mockRestore());
  const sentOptions = () => spy.mock.calls.map(([options]) => options);

  it('asks for the 2048 px cap only on photos over 1 MB, keeping their order', async () => {
    const me = await registerAndLogin(app);
    const res = await request(app).post('/posts').set(auth(me)).field('content', 'two photos')
      .attach('images', big, jpeg('big.jpg')).attach('images', small, jpeg('small.jpg'));
    expect(res.status).toBe(201);
    const [first, second] = sentOptions();
    expect(first).toEqual({ folder: 'posts', resource_type: 'image', transformation: CAP });
    expect(second).toEqual({ folder: 'posts', resource_type: 'image' });
  });

  it('does the same on the single-photo routes (story, cover)', async () => {
    const me = await registerAndLogin(app);
    expect((await request(app).post('/stories').set(auth(me)).attach('image', big, jpeg('s.jpg'))).status).toBe(201);
    expect((await request(app).put('/profile/cover').set(auth(me)).attach('cover', small, jpeg('c.jpg'))).status).toBe(200);
    expect(sentOptions()).toEqual([
      { folder: 'stories', resource_type: 'image', transformation: CAP },
      { folder: 'covers', resource_type: 'image' }
    ]);
  });

  it('never asks it of a voice note, however big', async () => {
    const alice = await registerAndLogin(app);
    const bob = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(alice)).send({ userId: bob.id })).body;
    const sent = await request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(alice))
      .attach('audio', big, { filename: 'note.webm', contentType: 'audio/webm' });
    expect(sent.status).toBe(201);
    expect(sentOptions()).toEqual([{ folder: 'voice-messages', resource_type: 'video', format: 'mp3' }]);
  });
});
