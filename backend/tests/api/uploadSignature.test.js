const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 75: an upload is checked by its first bytes, not only by the type the
// client claims (middleware/cloudinaryUpload.js). A file that isn't what it
// says is refused before anything goes to Cloudinary or is counted.
const hex = (h, rest = 'rest of the file') => Buffer.concat([Buffer.from(h, 'hex'), Buffer.from(rest)]);
const IMAGES = {
  jpeg: hex('ffd8ffe0'),
  png: hex('89504e470d0a1a0a'),
  gif87: hex('474946383761'),
  gif89: hex('474946383961'),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')])
};
const AUDIO = {
  webm: hex('1a45dfa3'),
  m4a: Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A ')]),
  ogg: Buffer.from('OggS rest'),
  mp3Tagged: Buffer.from('ID3 rest'),
  mp3Frame: hex('fffb9064')
};
const DISGUISED = {
  'a text file': Buffer.from('just some text, not a picture'),
  'an HTML page': Buffer.from('<html><script>alert(1)</script></html>'),
  'an SVG': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  'a PDF': Buffer.from('%PDF-1.7 rest'),
  'an empty file': Buffer.alloc(0)
};
const ONLY_IMAGES = 'Only JPEG, PNG, GIF, and WEBP images are allowed';

describe('uploads are checked by their bytes', () => {
  const { app, reset } = setupTestApp();
  const cloudinary = require('../../config/cloudinary');
  beforeEach(reset);
  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  const counted = async (u) => (await pool.query('SELECT count(*)::int AS n FROM media_uploads WHERE user_id = $1', [u.id])).rows[0].n;
  let spy;
  beforeEach(() => { spy = jest.spyOn(cloudinary.uploader, 'upload_stream'); });
  afterEach(() => spy.mockRestore());

  it('takes every allowed image format, whatever type the client named', async () => {
    const me = await registerAndLogin(app);
    for (const [name, bytes] of Object.entries(IMAGES)) {
      const res = await request(app).post('/stories').set(auth(me)).attach('image', bytes, { filename: `${name}.jpg`, contentType: 'image/jpeg' });
      expect([name, res.status]).toEqual([name, 201]);
    }
  });

  it('refuses a disguised file on every image route: nothing uploaded, nothing counted', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(me)).send({ userId: other.id })).body;
    const group = (await request(app).post('/conversations/groups').set(auth(me)).send({ name: 'G', userIds: [other.id] })).body;
    const routes = [
      ['post', '/posts', 'images'],
      ['post', '/drafts', 'images'],
      ['post', '/stories', 'image'],
      ['put', '/profile/cover', 'cover'],
      ['post', `/conversations/${conv.id}/messages/image`, 'image'],
      ['put', `/conversations/${group.id}/photo`, 'photo']
    ];
    for (const [method, path, field] of routes) {
      for (const [what, bytes] of Object.entries(DISGUISED)) {
        const res = await request(app)[method](path).set(auth(me)).attach(field, bytes, { filename: 'photo.jpg', contentType: 'image/jpeg' });
        expect([path, what, res.status, res.text]).toEqual([path, what, 400, ONLY_IMAGES]);
      }
    }
    expect(spy).not.toHaveBeenCalled();
    expect(await counted(me)).toBe(0);
  });

  it('refuses a whole post when one of its photos is disguised', async () => {
    const me = await registerAndLogin(app);
    const res = await request(app).post('/posts').set(auth(me)).field('content', 'three photos')
      .attach('images', IMAGES.png, { filename: 'a.png', contentType: 'image/png' })
      .attach('images', DISGUISED['an HTML page'], { filename: 'b.png', contentType: 'image/png' })
      .attach('images', IMAGES.jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect((await pool.query('SELECT count(*)::int AS n FROM posts WHERE user_id = $1', [me.id])).rows[0].n).toBe(0);
  });

  it('takes every allowed voice format and refuses anything else', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(me)).send({ userId: other.id })).body;
    const voice = (bytes) => request(app).post(`/conversations/${conv.id}/messages/voice`).set(auth(me))
      .attach('audio', bytes, { filename: 'note.webm', contentType: 'audio/webm' });
    for (const [name, bytes] of Object.entries(AUDIO)) expect([name, (await voice(bytes)).status]).toEqual([name, 201]);
    spy.mockClear();
    for (const bytes of [IMAGES.png, DISGUISED['a text file'], DISGUISED['an empty file']]) {
      const res = await voice(bytes);
      expect([res.status, res.text]).toEqual([400, 'Only WEBM, MP4, OGG, and MPEG audio files are allowed']);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
