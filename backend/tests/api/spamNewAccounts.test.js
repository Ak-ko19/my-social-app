const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 102: an account's first 24 hours have tighter limits (spamService),
// on top of the normal spam checks. On only with SPAM_CHECKS_IN_TESTS=1
// under the test suite.
describe('new-account safety (Day 102)', () => {
  const { app, reset } = setupTestApp();
  const saved = process.env.SPAM_CHECKS_IN_TESTS;
  beforeEach(async () => {
    process.env.SPAM_CHECKS_IN_TESTS = '1';
    await reset();
    resetMessageRateLimits();
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.SPAM_CHECKS_IN_TESTS;
    else process.env.SPAM_CHECKS_IN_TESTS = saved;
  });

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const age = (user, interval) => pool.query(`UPDATE users SET created_at = now() - interval '${interval}' WHERE id = $1`, [user.id]);
  const oldAccount = async () => {
    const user = await registerAndLogin(app);
    await age(user, '2 days');
    return user;
  };
  const post = (user, content) => request(app).post('/posts').set(auth(user)).field('content', content);
  const comment = (user, postId, content) => request(app).post(`/posts/${postId}/comments`).set(auth(user)).send({ content });
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const chatWith = async (a, b) => (await request(app).post('/conversations').set(auth(a)).send({ userId: b.id })).body.id;
  const say = (user, id, content = 'hi') => request(app).post(`/conversations/${id}/messages`).set(auth(user)).send({ content });
  const NEW_POSTING = 'New accounts can only post a few times in a short while. Please wait a few minutes and try again.';
  const NEW_STRANGERS = "New accounts can message up to 5 people who don't follow them in their first day. Please try again tomorrow.";

  it('posts: 3 in 10 minutes for a new account, 10 for an older one; a day later the new limit is gone', async () => {
    const fresh = await registerAndLogin(app);
    const old = await oldAccount();
    for (let i = 1; i <= 3; i++) expect((await post(fresh, `hello ${i}`)).status).toBe(201);
    const refused = await post(fresh, 'hello 4');
    expect(refused.status).toBe(429);
    expect(refused.text).toBe(NEW_POSTING);
    for (let i = 1; i <= 4; i++) expect((await post(old, `hi ${i}`)).status).toBe(201);
    // Just under a day old: still new; just over: not.
    await age(fresh, '23 hours 50 minutes');
    expect((await post(fresh, 'hello 5')).status).toBe(429);
    await age(fresh, '24 hours 10 minutes');
    expect((await post(fresh, 'hello 6')).status).toBe(201);
  });

  it('comments: 10 in 10 minutes for a new account', async () => {
    const fresh = await registerAndLogin(app);
    const target = (await post(await oldAccount(), 'a post')).body;
    for (let i = 1; i <= 10; i++) expect((await comment(fresh, target.id, `nice ${i}`)).status).toBe(201);
    const refused = await comment(fresh, target.id, 'nice 11');
    expect(refused.status).toBe(429);
    expect(refused.text).toBe('New accounts can only comment a few times in a short while. Please wait a few minutes and try again.');
  });

  it('links: 3 posts or comments with a link in an hour (any links), text without links goes on', async () => {
    const fresh = await registerAndLogin(app);
    const target = (await post(await oldAccount(), 'a post')).body;
    expect((await post(fresh, 'see https://a.example/one')).status).toBe(201);
    expect((await comment(fresh, target.id, 'and http://b.example/two')).status).toBe(201);
    expect((await post(fresh, 'also https://c.example/three')).status).toBe(201);
    await pool.query("UPDATE posts SET created_at = now() - interval '11 minutes' WHERE user_id = $1", [fresh.id]);
    const refused = await comment(fresh, target.id, 'more https://d.example/four');
    expect(refused.status).toBe(429);
    expect(refused.text).toBe('New accounts can only share a few links an hour. Please try again later.');
    const plain = await comment(fresh, target.id, 'no link here');
    expect(plain.status).toBe(201);
  });

  it('follows: 20 an hour for a new account; older ones and admins are not held back', async () => {
    const fresh = await registerAndLogin(app);
    const people = [];
    for (let i = 0; i < 21; i++) people.push(await registerAndLogin(app));
    for (let i = 0; i < 20; i++) expect((await follow(fresh, people[i])).status).toBe(201);
    const refused = await follow(fresh, people[20]);
    expect(refused.status).toBe(429);
    expect(refused.text).toBe('New accounts can follow up to 20 people an hour. Please try again later.');
    // An admin made today isn't held back.
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [fresh.id]);
    expect((await follow(fresh, people[20])).status).toBe(201);
  });

  it("messages: 5 strangers a day; a chat already started goes on, and people who follow you or wrote to you aren't strangers", async () => {
    const fresh = await registerAndLogin(app);
    const strangers = [];
    for (let i = 0; i < 6; i++) strangers.push(await oldAccount());
    const chats = [];
    for (const s of strangers) chats.push(await chatWith(fresh, s));
    for (let i = 0; i < 5; i++) expect((await say(fresh, chats[i])).status).toBe(201);
    const refused = await say(fresh, chats[5]);
    expect(refused.status).toBe(429);
    expect(refused.text).toBe(NEW_STRANGERS);
    // The first five go on.
    expect((await say(fresh, chats[0], 'again')).status).toBe(201);

    // Someone who follows you, or who has written to you, isn't a stranger.
    const fan = await oldAccount();
    await follow(fan, fresh);
    expect((await say(fresh, await chatWith(fresh, fan))).status).toBe(201);
    const writer = await oldAccount();
    const writerChat = await chatWith(writer, fresh);
    await say(writer, writerChat, 'hello new person');
    expect((await say(fresh, writerChat)).status).toBe(201);
    // A stranger who answers frees a place.
    await say(strangers[0], chats[0], 'hi back');
    expect((await say(fresh, chats[5])).status).toBe(201);
  });

  it('messages: group chats and story replies count as they should; older accounts are free', async () => {
    const fresh = await registerAndLogin(app);
    const old = await oldAccount();
    const others = [];
    for (let i = 0; i < 6; i++) others.push(await oldAccount());
    // A group chat isn't a stranger chat.
    const group = (await request(app).post('/conversations/groups').set(auth(fresh)).send({ name: 'Trip', userIds: others.slice(0, 3).map((u) => u.id) })).body;
    expect(group.id).toEqual(expect.any(Number));
    expect((await say(fresh, group.id)).status).toBe(201);
    for (let i = 0; i < 5; i++) expect((await say(fresh, await chatWith(fresh, others[i]))).status).toBe(201);
    // A story reply to a sixth stranger is a message to them too.
    await follow(fresh, others[5]);
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const story = (await request(app).post('/stories').set(auth(others[5])).attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
    const reply = await request(app).post(`/stories/${story.id}/reply`).set(auth(fresh)).send({ text: 'nice' });
    expect(reply.status).toBe(429);
    expect(reply.text).toBe(NEW_STRANGERS);
    // An older account writes to as many people as it likes.
    for (let i = 0; i < 6; i++) expect((await say(old, await chatWith(old, others[i]))).status).toBe(201);
  });
});
