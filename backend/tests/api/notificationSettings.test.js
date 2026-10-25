const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// B11: notification settings (migration 024, services/notificationService).
describe('notification settings (B11)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const prefs = (user) => request(app).get('/notification-preferences').set(auth(user));
  const setPrefs = (user, body) => request(app).put('/notification-preferences').set(auth(user)).send(body);
  const types = async (user) => (await request(app).get('/notifications').set(auth(user))).body.notifications.map((n) => n.type);

  let me;
  let other;
  let myPost;
  beforeEach(async () => {
    me = await registerAndLogin(app);
    other = await registerAndLogin(app);
    myPost = (await request(app).post('/posts').set(auth(me)).field('content', 'my post')).body;
  });

  it('defaults to everything on', async () => {
    const res = await prefs(me);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ likes: true, comments: true, mentions: true, follows: true, follow_accepted: true, messages: true, groups: true, pages: true, events: true, memories: true });
  });

  it('partial updates persist; validation rejects unknown keys and non-booleans', async () => {
    const res = await setPrefs(me, { likes: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ likes: false, comments: true });
    expect((await prefs(me)).body.likes).toBe(false);
    await setPrefs(me, { comments: false });
    expect((await prefs(me)).body).toMatchObject({ likes: false, comments: false, mentions: true });

    expect((await setPrefs(me, { likes: 'no' })).status).toBe(400);
    expect((await setPrefs(me, { emails: false })).status).toBe(400);
    expect((await setPrefs(me, {})).status).toBe(400);
    expect((await request(app).get('/notification-preferences')).status).toBe(401);
  });

  it('likes off: no like, reaction or comment-like notifications -- comments still arrive', async () => {
    await setPrefs(me, { likes: false });
    await request(app).post(`/posts/${myPost.id}/like`).set(auth(other));
    const myComment = (await request(app).post(`/posts/${myPost.id}/comments`).set(auth(me)).send({ content: 'mine' })).body;
    await request(app).post(`/comments/${myComment.id}/like`).set(auth(other));
    await request(app).post(`/posts/${myPost.id}/comments`).set(auth(other)).send({ content: 'nice' });
    expect(await types(me)).toEqual(['comment']);
  });

  it('comments off: no comment or reply notifications', async () => {
    await setPrefs(me, { comments: false });
    const mine = (await request(app).post(`/posts/${myPost.id}/comments`).set(auth(me)).send({ content: 'mine' })).body;
    await request(app).post(`/posts/${myPost.id}/comments`).set(auth(other)).send({ content: 'hi', parentCommentId: mine.id });
    await request(app).post(`/posts/${myPost.id}/comments`).set(auth(other)).send({ content: 'top level' });
    expect(await types(me)).toEqual([]);
  });

  it('mentions off: no mention notifications (batched path)', async () => {
    await setPrefs(me, { mentions: false });
    await request(app).post('/posts').set(auth(other)).field('content', `hey @${me.username}`);
    expect(await types(me)).toEqual([]);
    // ...while someone with mentions on still gets theirs.
    const third = await registerAndLogin(app);
    await request(app).post('/posts').set(auth(other)).field('content', `hey @${third.username} and @${me.username}`);
    expect(await types(third)).toEqual(['mention']);
  });

  it('follows off: no follow / follow_request; follow_accepted is its own switch', async () => {
    await setPrefs(me, { follows: false });
    await request(app).post(`/users/${me.id}/follow`).set(auth(other));
    expect(await types(me)).toEqual([]);

    await request(app).put('/profile/privacy').set(auth(other)).send({ isPrivate: true });
    await request(app).post(`/users/${other.id}/follow`).set(auth(me));
    await request(app).post(`/follow-requests/${me.id}/approve`).set(auth(other));
    expect(await types(me)).toEqual(['follow_accepted']);

    await setPrefs(me, { follow_accepted: false });
    await request(app).delete(`/users/${other.id}/follow`).set(auth(me));
    await request(app).post(`/users/${other.id}/follow`).set(auth(me));
    await request(app).post(`/follow-requests/${me.id}/approve`).set(auth(other));
    expect(await types(me)).toEqual(['follow_accepted']); // no second one
  });

  it('turning a category back on resumes those notifications; existing ones are never deleted', async () => {
    await request(app).post(`/posts/${myPost.id}/like`).set(auth(other));
    await setPrefs(me, { likes: false });
    expect(await types(me)).toEqual(['like']); // settings don't delete history
    await request(app).delete(`/posts/${myPost.id}/like`).set(auth(other));
    await request(app).post(`/posts/${myPost.id}/like`).set(auth(other));
    expect(await types(me)).toEqual(['like']);
    await setPrefs(me, { likes: true });
    // A new person's like (since Day 91 the same person liking again is
    // never news twice).
    const third = await registerAndLogin(app);
    await request(app).post(`/posts/${myPost.id}/like`).set(auth(third));
    // Both likes are kept; since Day 81 they show as one row (same post).
    const [likes] = (await request(app).get('/notifications').set(auth(me))).body.notifications;
    expect(likes).toMatchObject({ type: 'like', count: 2, actor_count: 2 });
  });
});
