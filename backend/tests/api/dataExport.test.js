const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { resetMessageRateLimits } = require('../../services/rateLimiter');

// Day 28: GET /profile/export -- "Download your information". Everything
// the account made or owns; never secrets, never other people's private
// data, never who blocked or reported this account.
describe('download your information (Day 28)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  beforeEach(resetMessageRateLimits);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const exportOf = async (user) => {
    const res = await request(app).get('/profile/export').set(auth(user));
    expect(res.status).toBe(200);
    return { res, data: JSON.parse(res.text) };
  };

  it('needs a login', async () => {
    expect((await request(app).get('/profile/export')).status).toBe(401);
  });

  it('downloads as a JSON file named after the account', async () => {
    const me = await registerAndLogin(app);
    const { res, data } = await exportOf(me);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(new RegExp(`^attachment; filename="mysocialapp-${me.username}-\\d{4}-\\d{2}-\\d{2}\\.json"$`));
    expect(res.headers['cache-control']).toBe('no-store');
    expect(data).toMatchObject({ format: 'mysocialapp-data-export', version: 1 });
    expect(data.profile).toMatchObject({ id: me.id, username: me.username, email: me.email });
    expect(data.settings.notifications).toEqual({ likes: true, comments: true, mentions: true, follows: true, follow_accepted: true, messages: true, groups: true, pages: true, events: true, memories: true });
  });

  it('contains what the account made, did and owns', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    await request(app).put('/profile').set(auth(me)).send({ username: me.username, email: me.email, bio: 'Tea lover' });
    const mine = (await request(app).post('/posts').set(auth(me)).field('content', 'My first post #tea').field('visibility', 'followers')).body;
    const theirs = (await request(app).post('/posts').set(auth(friend)).field('content', 'Friend post')).body;
    await request(app).put(`/posts/${theirs.id}/reaction`).set(auth(me)).send({ reaction: 'love' });
    await request(app).post(`/posts/${theirs.id}/bookmark`).set(auth(me));
    const comment = (await request(app).post(`/posts/${theirs.id}/comments`).set(auth(me)).send({ content: 'Nice one' })).body;
    await request(app).post(`/users/${friend.id}/follow`).set(auth(me));
    await request(app).post(`/users/${me.id}/follow`).set(auth(friend));
    const conv = (await request(app).post('/conversations').set(auth(me)).send({ userId: friend.id })).body;
    await request(app).post(`/conversations/${conv.id}/messages`).set(auth(me)).send({ content: 'hello friend' });
    await request(app).post(`/conversations/${conv.id}/messages`).set(auth(friend)).send({ content: 'hi back' });

    const { data } = await exportOf(me);
    expect(data.profile.bio).toBe('Tea lover');
    expect(data.posts).toEqual([expect.objectContaining({ id: mine.id, content: 'My first post #tea', visibility: 'followers', media: [] })]);
    expect(data.reactions).toEqual([expect.objectContaining({ post_id: theirs.id, reaction: 'love' })]);
    expect(data.saved_posts).toEqual([expect.objectContaining({ post_id: theirs.id })]);
    expect(data.comments).toEqual([expect.objectContaining({ id: comment.id, post_id: theirs.id, content: 'Nice one' })]);
    expect(data.connections.following).toEqual([expect.objectContaining({ username: friend.username })]);
    expect(data.connections.followers).toEqual([expect.objectContaining({ username: friend.username })]);
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0].participants.sort()).toEqual([me.username, friend.username].sort());
    expect(data.conversations[0].messages.map((m) => [m.sender, m.content])).toEqual([[me.username, 'hello friend'], [friend.username, 'hi back']]);
    expect(data.notifications).toEqual([expect.objectContaining({ type: 'follow', from_user: friend.username })]);
  });

  it('a deleted message is listed without its text', async () => {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const conv = (await request(app).post('/conversations').set(auth(me)).send({ userId: friend.id })).body;
    const msg = (await request(app).post(`/conversations/${conv.id}/messages`).set(auth(me)).send({ content: 'oops wrong chat' })).body;
    await request(app).delete(`/conversations/${conv.id}/messages/${msg.id}`).set(auth(me));
    const { res, data } = await exportOf(me);
    expect(data.conversations[0].messages).toEqual([expect.objectContaining({ id: msg.id, deleted_at: expect.any(String) })]);
    expect(data.conversations[0].messages[0]).not.toHaveProperty('content');
    expect(res.text).not.toContain('oops wrong chat');
  });

  it('never contains secrets, other people\'s private data, or who blocked or reported me', async () => {
    const me = await registerAndLogin(app);
    const other = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    const strangerFriend = await registerAndLogin(app);
    await request(app).post(`/users/${me.id}/follow`).set(auth(other));
    await request(app).post(`/users/${me.id}/block`).set(auth(stranger));
    await request(app).post('/reports').set(auth(other)).send({ targetType: 'user', targetId: me.id, reason: 'spam' });
    const theirConv = (await request(app).post('/conversations').set(auth(stranger)).send({ userId: strangerFriend.id })).body;
    await request(app).post(`/conversations/${theirConv.id}/messages`).set(auth(stranger)).send({ content: 'a private chat' });

    const { res, data } = await exportOf(me);
    const text = res.text;
    for (const secret of ['password', 'reset_token', 'verification_token', 'endpoint', 'p256dh', '"auth"', 'tokens_valid_after']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(me.password);
    expect(text).not.toContain(other.email);
    expect(text).not.toContain(stranger.username);
    expect(text).not.toContain('a private chat');
    expect(data.reports_you_made).toEqual([]);
    expect(data.connections.blocked_users).toEqual([]);
    expect(data.login_sessions.length).toBeGreaterThan(0);
    expect(Object.keys(data.login_sessions[0]).sort()).toEqual(['created_at', 'expires_at', 'last_seen_at', 'revoked_at', 'user_agent']);
  });

  it('stories carry a view count, never who viewed them (the app never shows that)', async () => {
    const me = await registerAndLogin(app);
    const viewer = await registerAndLogin(app);
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const story = (await request(app).post('/stories').set(auth(me)).attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
    await request(app).post(`/users/${me.id}/follow`).set(auth(viewer));
    expect((await request(app).post(`/stories/${story.id}/view`).set(auth(viewer))).status).toBeLessThan(300);
    const { data } = await exportOf(me);
    expect(data.stories).toEqual([expect.objectContaining({ id: story.id, views: 1 })]);
    expect(Object.keys(data.stories[0]).sort()).toEqual(['close_friends', 'created_at', 'expires_at', 'id', 'media_url', 'views']);
  });

  it('lists who I blocked and what I reported', async () => {
    const me = await registerAndLogin(app);
    const pest = await registerAndLogin(app);
    await request(app).post(`/users/${pest.id}/block`).set(auth(me));
    await request(app).post('/reports').set(auth(me)).send({ targetType: 'user', targetId: pest.id, reason: 'spam' });
    const { data } = await exportOf(me);
    expect(data.connections.blocked_users).toEqual([expect.objectContaining({ username: pest.username })]);
    expect(data.reports_you_made).toEqual([expect.objectContaining({ target_type: 'user', target_id: pest.id, reason: 'spam' })]);
  });
});
