const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 4: scripts/cloudinary-orphans.js finds files nothing uses any more
// (dry run by default) and deletes them with --delete, with safety guards.
describe('cloudinary-orphans script', () => {
  const { app, reset } = setupTestApp();
  const { run, parseArgs } = require('../../scripts/cloudinary-orphans');

  const NOW = new Date('2026-09-28T12:00:00Z');
  const OLD = '2026-09-01T00:00:00Z';
  const NEW = '2026-09-28T11:00:00Z'; // 1 h before NOW
  const url = (type, publicId) => `https://res.cloudinary.com/test/${type}/upload/v1/${publicId}.${type === 'video' ? 'mp3' : 'jpg'}`;

  // In-memory Admin API: pages of 2 so pagination is exercised.
  function fakeApi(files) {
    const store = files.map((f) => ({ ...f }));
    return {
      store,
      resources: jest.fn(async ({ resource_type: type, prefix, next_cursor: cursor }) => {
        const matching = store.filter((f) => f.type === type && f.public_id.startsWith(prefix));
        const start = cursor ? Number(cursor) : 0;
        const page = matching.slice(start, start + 2);
        return {
          resources: page.map((f) => ({ public_id: f.public_id, created_at: f.created_at, bytes: 1024 })),
          next_cursor: start + 2 < matching.length ? String(start + 2) : undefined
        };
      }),
      delete_resources: jest.fn(async (ids, { resource_type: type }) => {
        for (const id of ids) {
          const i = store.findIndex((f) => f.type === type && f.public_id === id);
          if (i >= 0) store.splice(i, 1);
        }
        return { deleted: {} };
      })
    };
  }

  let lines;
  const log = (line) => lines.push(line);
  const output = () => lines.join('\n');
  const scan = (api, argv = []) => run({ argv, api, db: require('../../db'), cloud: 'test', now: NOW, log });
  const remaining = (api) => api.store.map((f) => `${f.type}:${f.public_id}`).sort();

  // The database uses: an avatar, a post (image_url + 2 post_media), a
  // story, a live voice note. A soft-deleted message's photo is NOT used.
  let user;
  beforeEach(async () => {
    await reset();
    lines = [];
    user = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url('image', 'avatars/me'), user.id]);
    const post = (await pool.query('INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING id',
      [user.id, 'hi', url('image', 'posts/p1')])).rows[0];
    await pool.query('INSERT INTO post_media (post_id, url, position) VALUES ($1, $2, 0), ($1, $3, 1)',
      [post.id, url('image', 'posts/p1'), url('image', 'posts/p2')]);
    await pool.query('INSERT INTO stories (user_id, media_url) VALUES ($1, $2)', [user.id, url('image', 'stories/s1')]);
    const conv = (await request(app).post('/conversations').set('Authorization', `Bearer ${user.token}`).send({ userId: other.id })).body;
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, type, media_url, duration_seconds, deleted_at) VALUES
         ($1, $2, 'voice', $3, 3, NULL),
         ($1, $2, 'image', $4, NULL, now())`,
      [conv.id, user.id, url('video', 'voice-messages/v1'), url('image', 'message-images/deleted')]
    );
  });

  const USED = [
    { type: 'image', public_id: 'avatars/me', created_at: OLD },
    { type: 'image', public_id: 'posts/p1', created_at: OLD },
    { type: 'image', public_id: 'posts/p2', created_at: OLD },
    { type: 'image', public_id: 'stories/s1', created_at: OLD },
    { type: 'video', public_id: 'voice-messages/v1', created_at: OLD }
  ];
  const ORPHANS = [
    { type: 'image', public_id: 'message-images/deleted', created_at: OLD }, // soft-deleted message
    { type: 'image', public_id: 'posts/old-orphan', created_at: OLD },
    { type: 'video', public_id: 'voice-messages/old-orphan', created_at: OLD }
  ];
  const IN_PROGRESS = { type: 'image', public_id: 'posts/just-uploaded', created_at: NEW };
  const NOT_OURS = { type: 'image', public_id: 'marketing/banner', created_at: OLD };
  const ALL = [...USED, ...ORPHANS, IN_PROGRESS, NOT_OURS];

  it('dry run: reports the orphans and deletes nothing', async () => {
    const api = fakeApi(ALL);
    expect(await scan(api)).toBe(0);
    expect(api.delete_resources).not.toHaveBeenCalled();
    expect(output()).toMatch(/Cloudinary files in the app's folders: 9/); // not marketing/
    expect(output()).toMatch(/Files the database uses: 5/);
    expect(output()).toMatch(/Orphans older than 24 h: 3 .*1 newer unused file\(s\) skipped/);
    for (const o of ORPHANS) expect(output()).toContain(o.public_id);
    expect(output()).toMatch(/Dry run: nothing deleted/);
  });

  it('--delete removes exactly the old orphans; used, new and foreign files stay', async () => {
    const api = fakeApi(ALL);
    expect(await scan(api, ['--delete'])).toBe(0);
    expect(remaining(api)).toEqual([...USED, IN_PROGRESS, NOT_OURS].map((f) => `${f.type}:${f.public_id}`).sort());
    expect(api.delete_resources.mock.calls.every(([, o]) => o.invalidate === true && o.type === 'upload')).toBe(true);
    expect(output()).toMatch(/Deleted 3 file\(s\)\./);
  });

  it('--min-age-hours=0 also counts files uploaded moments ago', async () => {
    const api = fakeApi(ALL);
    await scan(api, ['--delete', '--min-age-hours=0']);
    expect(remaining(api)).not.toContain('image:posts/just-uploaded');
  });

  it('pages through large folders', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ type: 'image', public_id: `posts/x${i}`, created_at: OLD }));
    const api = fakeApi([...USED, ...many]);
    await scan(api);
    expect(output()).toMatch(/Cloudinary files in the app's folders: 12/);
    expect(output()).toMatch(/Orphans older than 24 h: 7/);
  });

  it('refuses to delete when the database looks wrong (no media at all), unless --force', async () => {
    await reset(); // an empty database, e.g. the wrong DATABASE_URL
    const api = fakeApi(ALL);
    expect(await scan(api, ['--delete'])).toBe(1);
    expect(api.delete_resources).not.toHaveBeenCalled();
    expect(output()).toMatch(/Is DATABASE_URL the right database\?/);
    expect(await scan(api, ['--delete', '--force'])).toBe(0);
    expect(api.delete_resources).toHaveBeenCalled();
  });

  it('refuses to delete more than half of the files, unless --force', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ type: 'image', public_id: `posts/x${i}`, created_at: OLD }));
    const api = fakeApi([...USED, ...many]);
    expect(await scan(api, ['--delete'])).toBe(1);
    expect(output()).toMatch(/Refusing to delete 10 of 15 files/);
    expect(api.delete_resources).not.toHaveBeenCalled();
    expect(await scan(api, ['--delete', '--force'])).toBe(0);
    expect(remaining(api)).toHaveLength(5);
  });

  it('reports failed deletes with a non-zero exit code', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const api = fakeApi(ALL);
    api.delete_resources.mockRejectedValue(new Error('Rate limit exceeded'));
    expect(await scan(api, ['--delete'])).toBe(1);
    expect(output()).toMatch(/Deleted 0 file\(s\); 3 failed/);
    logged.mockRestore();
  });

  it('needs Cloudinary settings and valid options', async () => {
    expect(await run({ argv: [], api: fakeApi([]), db: require('../../db'), cloud: null, log })).toBe(2);
    expect(output()).toMatch(/Cloudinary is not configured/);
    expect(await scan(fakeApi([]), ['--delet'])).toBe(2);
    expect(() => parseArgs(['--min-age-hours=abc'])).toThrow(/whole number/);
    expect(parseArgs(['--delete', '--min-age-hours=6'])).toEqual({ delete: true, force: false, minAgeHours: 6 });
  });
});
