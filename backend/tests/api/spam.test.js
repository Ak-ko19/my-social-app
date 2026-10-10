const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 49 step 3: spam checks on new posts and comments -- flooding, the
// same text again, the same link again and again. On only with
// SPAM_CHECKS_IN_TESTS=1 under the test suite.
describe('spam checks (Day 49)', () => {
  const { app, reset } = setupTestApp();
  const saved = process.env.SPAM_CHECKS_IN_TESTS;
  beforeEach(async () => {
    process.env.SPAM_CHECKS_IN_TESTS = '1';
    await reset();
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.SPAM_CHECKS_IN_TESTS;
    else process.env.SPAM_CHECKS_IN_TESTS = saved;
  });

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = (user, content) => request(app).post('/posts').set(auth(user)).field('content', content);
  const comment = (user, postId, content) => request(app).post(`/posts/${postId}/comments`).set(auth(user)).send({ content });
  // Rows from earlier, straight into the table (no API, no checks).
  const oldPosts = (user, contents, minutesAgo) => pool.query(
    `INSERT INTO posts (user_id, content, created_at) SELECT $1, c, now() - make_interval(mins => $3) FROM unnest($2::text[]) c`,
    [user.id, contents, minutesAgo]
  );
  const oldComments = (user, postId, contents, minutesAgo) => pool.query(
    `INSERT INTO comments (post_id, user_id, content, created_at) SELECT $1, $2, c, now() - make_interval(mins => $4) FROM unnest($3::text[]) c`,
    [postId, user.id, contents, minutesAgo]
  );
  const range = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix} ${i}`);

  it('is off under NODE_ENV=test unless SPAM_CHECKS_IN_TESTS=1', async () => {
    delete process.env.SPAM_CHECKS_IN_TESTS;
    const me = await registerAndLogin(app);
    expect((await post(me, 'same')).status).toBe(201);
    expect((await post(me, 'same')).status).toBe(201);
  });

  it('posts: the 11th in 10 minutes waits; older ones and other people don\'t count', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    await oldPosts(me, range(9, 'earlier'), 5);
    await oldPosts(me, range(5, 'long ago'), 11);
    await oldPosts(other, range(10, 'theirs'), 1);
    expect((await post(me, 'the tenth')).status).toBe(201);
    const flood = await post(me, 'the eleventh');
    expect(flood.status).toBe(429);
    expect(flood.text).toBe("You're posting too fast. Please wait a few minutes and try again.");
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM posts WHERE user_id = $1', [me.id])).rows[0].n).toBe(15);
    expect((await post(other, 'mine are fine... no, 11th')).status).toBe(429);
  });

  it('posts: the same text again within 10 minutes (any spacing or case), not after', async () => {
    const me = await registerAndLogin(app);
    expect((await post(me, 'Buy cheap followers')).status).toBe(201);
    const again = await post(me, '  buy   CHEAP followers ');
    expect(again.status).toBe(429);
    expect(again.text).toBe('You just posted this. Try writing something new.');
    await oldPosts(me, ['Good morning'], 11);
    expect((await post(me, 'Good morning')).status).toBe(201);
    // Someone else may say the same thing.
    const other = await registerAndLogin(app);
    expect((await post(other, 'Buy cheap followers')).status).toBe(201);
  });

  it('comments: the 31st in 10 minutes waits', async () => {
    const me = await registerAndLogin(app);
    const target = (await post(me, 'a post')).body;
    await oldComments(me, target.id, range(29, 'c'), 3);
    expect((await comment(me, target.id, 'thirtieth')).status).toBe(201);
    const flood = await comment(me, target.id, 'thirty-first');
    expect(flood.status).toBe(429);
    expect(flood.text).toBe("You're commenting too fast. Please wait a few minutes and try again.");
  });

  it('comments: the same text on the same post waits; on another post it is fine', async () => {
    const me = await registerAndLogin(app);
    const author = await registerAndLogin(app);
    const first = (await post(author, 'first')).body;
    const second = (await post(author, 'second')).body;
    expect((await comment(me, first.id, 'Thanks!')).status).toBe(201);
    const again = await comment(me, first.id, 'thanks!');
    expect(again.status).toBe(429);
    expect(again.text).toBe('You already left this comment on this post.');
    expect((await comment(me, second.id, 'Thanks!')).status).toBe(201);
    // A missing post is still a 404, not a spam answer.
    expect((await comment(me, 99999, 'Thanks!')).status).toBe(404);
  });

  it('links: the 4th post or comment with the same link in an hour waits, however it is typed', async () => {
    const me = await registerAndLogin(app);
    const author = await registerAndLogin(app);
    const target = (await post(author, 'look')).body;
    expect((await post(me, 'Deal: https://spam.example/deal?ref=1')).status).toBe(201);
    expect((await comment(me, target.id, 'see http://WWW.spam.example/deal/')).status).toBe(201);
    expect((await post(me, 'again https://spam.example/Deal#top')).status).toBe(201);
    const fourth = await comment(me, target.id, 'https://spam.example/deal?ref=99');
    expect(fourth.status).toBe(429);
    expect(fourth.text).toBe("You've shared this link too many times in the last hour. Please try again later.");
    expect((await post(me, 'last one https://spam.example/deal')).status).toBe(429);
    // A different page on the site, another site, or an hour later is fine.
    expect((await post(me, 'https://spam.example/deals')).status).toBe(201);
    expect((await post(me, 'https://news.example/deal')).status).toBe(201);
    const later = await registerAndLogin(app);
    await oldPosts(later, ['https://a.example/x', 'https://a.example/x', 'https://a.example/x'], 61);
    expect((await post(later, 'https://a.example/x')).status).toBe(201);
    // ...and a longer path in earlier posts isn't this link either.
    const longer = await registerAndLogin(app);
    await oldPosts(longer, ['https://b.example/ab', 'https://b.example/abc', 'https://b.example/a.b'], 5);
    expect((await post(longer, 'https://b.example/a')).status).toBe(201);
  });

  it('reads links as the app does', () => {
    // Loaded here: the db module must come after setupTestApp's settings.
    const spamService = require('../../services/spamService');
    expect(spamService.linkKeys('a https://WWW.Site.example/A/b/?q=1, and (https://x.example).')).toEqual(['site.example/a/b', 'x.example']);
    expect(spamService.linkKeys('no links, www.site.example or site.example')).toEqual([]);
    expect(spamService.linkKeys('bad http://[::1 link')).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => `https://s${i}.example`).join(' ');
    expect(spamService.linkKeys(many)).toHaveLength(5);
  });
});
