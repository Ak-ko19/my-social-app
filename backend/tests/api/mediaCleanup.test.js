const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 4 (audit bug #5): deleting content deletes its images and voice notes
// from Cloudinary, instead of leaving them public at their URL forever.
const CLOUD_ENV = { CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };

describe('media cleanup', () => {
  const { app, reset } = setupTestApp();
  const cloudinary = require('../../config/cloudinary'); // the setupTestApp mock
  const { cloudinaryAsset, deleteMedia } = require('../../services/mediaCleanupService');

  const saved = {};
  beforeAll(() => {
    for (const [k, v] of Object.entries(CLOUD_ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  });
  afterAll(() => {
    for (const k of Object.keys(CLOUD_ENV)) process.env[k] = saved[k];
  });
  beforeEach(async () => {
    await reset();
    cloudinary.api.delete_resources.mockClear();
    cloudinary.api.delete_resources.mockImplementation(async () => ({ deleted: {} }));
  });

  // deleteMedia runs after the response (not awaited): let it finish.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  // [[resourceType, publicId], ...] of every delete call so far, sorted.
  async function deleted() {
    await settle();
    return cloudinary.api.delete_resources.mock.calls
      .flatMap(([ids, options]) => ids.map((id) => [options.resource_type, id]))
      .sort();
  }
  const idOf = (url) => url.match(/v\d+\/(.+)\.\w+$/)[1];

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const postWithImages = async (user, n, fields = {}) => {
    let req = request(app).post('/posts').set(auth(user)).field('content', 'pics');
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    for (let i = 0; i < n; i += 1) req = req.attach('images', png, { filename: `${i}.png`, contentType: 'image/png' });
    return req;
  };

  describe('cloudinaryAsset (public_id from the stored URL)', () => {
    it('reads resource type and public_id, folders included', () => {
      expect(cloudinaryAsset('https://res.cloudinary.com/demo/image/upload/v1712345678/posts/abc123.jpg', 'demo'))
        .toEqual({ resourceType: 'image', publicId: 'posts/abc123' });
      expect(cloudinaryAsset('https://res.cloudinary.com/demo/video/upload/v1/voice-messages/x_y-z.mp3', 'demo'))
        .toEqual({ resourceType: 'video', publicId: 'voice-messages/x_y-z' });
      expect(cloudinaryAsset('https://res.cloudinary.com/demo/image/upload/v1/a/b/my%20pic.png', 'demo'))
        .toEqual({ resourceType: 'image', publicId: 'a/b/my pic' });
    });

    it('never matches anything but an upload on our own cloud', () => {
      for (const url of [
        'https://res.cloudinary.com/someone-else/image/upload/v1/posts/a.jpg',
        'https://res.cloudinary.com/demo/image/upload/c_fill,w_100/v1/posts/a.jpg',
        'https://res.cloudinary.com/demo/image/private/v1/posts/a.jpg',
        'https://res.cloudinary.com/demo/raw/upload/v1/file.txt',
        'http://res.cloudinary.com/demo/image/upload/v1/posts/a.jpg',
        'https://evil.example/demo/image/upload/v1/posts/a.jpg',
        'https://res.cloudinary.com/demo.evil/image/upload/v1/posts/a.jpg',
        '/uploads/a.jpg', '', null, 42
      ]) {
        expect(cloudinaryAsset(url, 'demo')).toBeNull();
      }
      expect(cloudinaryAsset('https://res.cloudinary.com/demo/image/upload/v1/a.jpg', null)).toBeNull();
    });

    // Day 4 step 2: public_id is derived, not stored. Prove the parser reads
    // back exactly what the real Cloudinary SDK puts in a URL (built offline).
    it('round-trips URLs built by the real Cloudinary SDK', () => {
      const sdk = jest.requireActual('cloudinary').v2;
      const cases = [
        ['posts/abc123', 'image', 'jpg'],
        ['voice-messages/x_y', 'video', 'mp3'],
        ['a/b/my pic', 'image', 'png'],
        ['avatars/ünïcode-名前', 'image', 'webp'],
        ['stories/s.1', 'image', 'jpg'],
        ['message-images/IMG_0001', 'image', 'gif']
      ];
      for (const [publicId, resourceType, format] of cases) {
        const url = sdk.url(publicId, { cloud_name: 'demo', secure: true, version: 1712345678, resource_type: resourceType, format });
        expect(cloudinaryAsset(url, 'demo')).toEqual({ publicId, resourceType });
      }
    });
  });

  describe('deleteMedia', () => {
    const img = (i) => `https://res.cloudinary.com/test/image/upload/v1/posts/p${i}.jpg`;

    it('groups by resource type, skips duplicates/foreign URLs, batches by 100', async () => {
      const urls = [...Array.from({ length: 250 }, (_, i) => img(i)), img(0), 'https://res.cloudinary.com/test/video/upload/v1/voice/v1.mp3', 'https://other.example/x.jpg', null];
      await deleteMedia(urls);
      const calls = cloudinary.api.delete_resources.mock.calls;
      expect(calls.map(([ids, o]) => [o.resource_type, ids.length])).toEqual([['image', 100], ['image', 100], ['image', 50], ['video', 1]]);
      expect(calls[0][1]).toMatchObject({ type: 'upload', invalidate: true });
    });

    it('does nothing when Cloudinary is not configured (local dev, e2e)', async () => {
      process.env.CLOUDINARY_API_SECRET = '';
      try {
        await deleteMedia([img(1)]);
        expect(cloudinary.api.delete_resources).not.toHaveBeenCalled();
      } finally {
        process.env.CLOUDINARY_API_SECRET = CLOUD_ENV.CLOUDINARY_API_SECRET;
      }
    });

    it('never throws when Cloudinary fails; logs and carries on with the next batch', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      cloudinary.api.delete_resources.mockRejectedValueOnce(new Error('rate limited'));
      await expect(deleteMedia([img(1), 'https://res.cloudinary.com/test/video/upload/v1/voice/a.mp3'])).resolves.toBeUndefined();
      expect(cloudinary.api.delete_resources).toHaveBeenCalledTimes(2);
      expect(logged.mock.calls.flat().join(' ')).toMatch(/rate limited/);
      logged.mockRestore();
    });
  });

  describe('deleting content', () => {
    it('post: its images go; someone else can not delete it (and nothing is deleted)', async () => {
      const author = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const post = (await postWithImages(author, 2)).body;

      expect((await request(app).delete(`/posts/${post.id}`).set(auth(other))).status).toBe(403);
      expect(await deleted()).toEqual([]);

      expect((await request(app).delete(`/posts/${post.id}`).set(auth(author))).status).toBe(200);
      expect(await deleted()).toEqual(post.media.map((m) => ['image', idOf(m.url)]).sort());
    });

    it('post removed by an admin from a report', async () => {
      const admin = await registerAndLogin(app);
      await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
      const author = await registerAndLogin(app);
      const reporter = await registerAndLogin(app);
      const post = (await postWithImages(author, 1)).body;
      const report = (await request(app).post('/reports').set(auth(reporter)).send({ targetType: 'post', targetId: post.id, reason: 'spam' })).body;

      expect((await request(app).post(`/admin/reports/${report.id}/remove-content`).set(auth(admin))).status).toBe(200);
      expect(await deleted()).toEqual([['image', idOf(post.media[0].url)]]);
    });

    it('story', async () => {
      const user = await registerAndLogin(app);
      const story = (await request(app).post('/stories').set(auth(user)).attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
      expect((await request(app).delete(`/stories/${story.id}`).set(auth(user))).status).toBe(200);
      expect(await deleted()).toEqual([['image', idOf(story.media_url)]]);
    });

    it('DM photo and voice note (the message row stays, soft-deleted)', async () => {
      const a = await registerAndLogin(app);
      const b = await registerAndLogin(app);
      const conv = (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body;
      const photo = (await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(a))
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' })).body;
      const voiceUrl = 'https://res.cloudinary.com/test/video/upload/v1700000000/voice-messages/hello.mp3';
      const voice = (await pool.query(
        "INSERT INTO messages (conversation_id, sender_id, type, media_url, duration_seconds) VALUES ($1, $2, 'voice', $3, 4) RETURNING id",
        [conv.id, a.id, voiceUrl]
      )).rows[0];

      expect((await request(app).delete(`/conversations/${conv.id}/messages/${photo.id}`).set(auth(b))).status).toBe(403);
      expect(await deleted()).toEqual([]);
      for (const id of [photo.id, voice.id]) {
        expect((await request(app).delete(`/conversations/${conv.id}/messages/${id}`).set(auth(a))).status).toBe(200);
      }
      expect(await deleted()).toEqual([['image', idOf(photo.media_url)], ['video', 'voice-messages/hello']].sort());
    });

    it('account: avatar, posts (incl. page posts), stories and sent media; nobody else\'s', async () => {
      const me = await registerAndLogin(app);
      const friend = await registerAndLogin(app);
      const avatar = (await request(app).put('/profile').set(auth(me)).field('username', me.username).field('email', me.email)
        .attach('avatar', png, { filename: 'a.png', contentType: 'image/png' })).body.avatar_url;
      const myPost = (await postWithImages(me, 2)).body;
      const page = (await request(app).post('/pages').set(auth(me)).send({ name: 'My Cafe', category: 'business' })).body;
      const pagePost = (await postWithImages(me, 1, { pageId: String(page.id) })).body;
      const story = (await request(app).post('/stories').set(auth(me)).attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
      const conv = (await request(app).post('/conversations').set(auth(me)).send({ userId: friend.id })).body;
      const myPhoto = (await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(me))
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' })).body;
      const friendsPhoto = (await request(app).post(`/conversations/${conv.id}/messages/image`).set(auth(friend))
        .attach('image', png, { filename: 'y.png', contentType: 'image/png' })).body;
      const friendsPost = (await postWithImages(friend, 1)).body;
      await settle();
      cloudinary.api.delete_resources.mockClear(); // the avatar was the first one: nothing replaced

      const res = await request(app).delete('/profile').set(auth(me)).send({ password: me.password });
      expect(res.status).toBe(200);
      const mine = [avatar, ...myPost.media.map((m) => m.url), pagePost.media[0].url, story.media_url, myPhoto.media_url];
      expect(await deleted()).toEqual(mine.map((u) => ['image', idOf(u)]).sort());
      const gone = (await deleted()).map(([, id]) => id);
      expect(gone).not.toContain(idOf(friendsPhoto.media_url));
      expect(gone).not.toContain(idOf(friendsPost.media[0].url));
    });

    it('page: its posts\' images go with it', async () => {
      const owner = await registerAndLogin(app);
      const page = (await request(app).post('/pages').set(auth(owner)).send({ name: 'Shop', category: 'business' })).body;
      const pagePost = (await postWithImages(owner, 1, { pageId: String(page.id) })).body;
      await postWithImages(owner, 1); // personal post: stays
      await settle();
      cloudinary.api.delete_resources.mockClear();

      expect((await request(app).delete(`/pages/${page.id}`).set(auth(owner))).status).toBe(200);
      expect(await deleted()).toEqual([['image', idOf(pagePost.media[0].url)]]);
    });

    it('group (community) deleted when its last member leaves: everyone\'s post images go', async () => {
      const owner = await registerAndLogin(app);
      const member = await registerAndLogin(app);
      const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Club' })).body;
      await request(app).post(`/communities/${group.id}/join`).set(auth(member));
      const memberPost = (await postWithImages(member, 1, { communityId: String(group.id) })).body;
      expect(memberPost.media).toHaveLength(1);

      await request(app).delete(`/communities/${group.id}/members/${member.id}`).set(auth(member));
      expect(await deleted()).toEqual([]); // the group still exists
      await request(app).delete(`/communities/${group.id}/members/${owner.id}`).set(auth(owner));
      expect(await deleted()).toEqual([['image', idOf(memberPost.media[0].url)]]);
    });

    it('group deleted by an admin (Day 50): every member\'s post images go', async () => {
      const owner = await registerAndLogin(app);
      const member = await registerAndLogin(app);
      const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Club' })).body;
      await request(app).post(`/communities/${group.id}/join`).set(auth(member));
      const ownerPost = (await postWithImages(owner, 1, { communityId: String(group.id) })).body;
      const memberPost = (await postWithImages(member, 2, { communityId: String(group.id) })).body;
      const elsewhere = (await postWithImages(member, 1)).body;
      expect((await request(app).delete(`/communities/${group.id}`).set(auth(owner))).body).toEqual({ deleted: true });
      expect(await deleted()).toEqual([...ownerPost.media, ...memberPost.media].map((m) => ['image', idOf(m.url)]).sort());
      expect(elsewhere.media).toHaveLength(1);
    });

    it('group chat deleted when its last member leaves: its photos go', async () => {
      const owner = await registerAndLogin(app);
      const m1 = await registerAndLogin(app);
      const chat = (await request(app).post('/conversations/groups').set(auth(owner)).send({ name: 'Crew', userIds: [m1.id] })).body;
      const photo = (await request(app).post(`/conversations/${chat.id}/messages/image`).set(auth(m1))
        .attach('image', png, { filename: 'x.png', contentType: 'image/png' })).body;
      await request(app).delete(`/conversations/${chat.id}/members/${m1.id}`).set(auth(m1));
      expect(await deleted()).toEqual([]);
      await request(app).delete(`/conversations/${chat.id}/members/${owner.id}`).set(auth(owner));
      expect(await deleted()).toEqual([['image', idOf(photo.media_url)]]);
    });

    it('a replaced avatar is deleted; the first one replaces nothing', async () => {
      const user = await registerAndLogin(app);
      const put = () => request(app).put('/profile').set(auth(user)).field('username', user.username).field('email', user.email)
        .attach('avatar', png, { filename: 'a.png', contentType: 'image/png' });
      const first = (await put()).body.avatar_url;
      expect(await deleted()).toEqual([]);
      const second = (await put()).body.avatar_url;
      expect(second).not.toBe(first);
      expect(await deleted()).toEqual([['image', idOf(first)]]);
    });

    it('still deletes the post when Cloudinary cleanup fails', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      cloudinary.api.delete_resources.mockRejectedValue(new Error('Cloudinary down'));
      const author = await registerAndLogin(app);
      const post = (await postWithImages(author, 1)).body;
      expect((await request(app).delete(`/posts/${post.id}`).set(auth(author))).status).toBe(200);
      expect((await request(app).get(`/posts/${post.id}`).set(auth(author))).status).toBe(404);
      await settle();
      logged.mockRestore();
    });
  });

  describe('uploads the request then refuses', () => {
    it('removes images of a refused post (not a group member, empty content)', async () => {
      const outsider = await registerAndLogin(app);
      const owner = await registerAndLogin(app);
      const group = (await request(app).post('/communities').set(auth(owner)).send({ name: 'Private club', privacy: 'private' })).body;
      expect((await postWithImages(outsider, 2, { communityId: String(group.id) })).status).toBe(403);
      expect((await deleted()).map(([t]) => t)).toEqual(['image', 'image']);

      cloudinary.api.delete_resources.mockClear();
      const empty = await request(app).post('/posts').set(auth(outsider)).field('content', ' ')
        .attach('images', png, { filename: 'a.png', contentType: 'image/png' });
      expect(empty.status).toBe(400);
      expect(await deleted()).toHaveLength(1);
    });

    it('removes the new avatar when the profile update is refused', async () => {
      const a = await registerAndLogin(app);
      const b = await registerAndLogin(app);
      const res = await request(app).put('/profile').set(auth(a)).field('username', b.username).field('email', a.email)
        .attach('avatar', png, { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(400); // username taken
      expect(await deleted()).toHaveLength(1);
      expect((await request(app).get('/profile/me').set(auth(a))).body.avatar_url).toBeNull();
    });

    it('keeps the images of a post that was created', async () => {
      const user = await registerAndLogin(app);
      expect((await postWithImages(user, 2)).status).toBe(201);
      expect(await deleted()).toEqual([]);
    });
  });
});
