const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { pool } = require('../helpers/testDb');

// Day 47 step 3: close friends (migration 057) -- a list, and a "Close
// friends" audience for posts and stories, seen only by the author and the
// people on the author's list.
describe('close friends (Day 47)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);

  const auth = (user) => ({ Authorization: `Bearer ${user.token}` });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const follow = (a, b) => request(app).post(`/users/${b.id}/follow`).set(auth(a));
  const add = (a, b) => request(app).put(`/close-friends/${b.id}`).set(auth(a));
  const post = async (user, content, visibility = 'close_friends') =>
    (await request(app).post('/posts').set(auth(user)).field('content', content).field('visibility', visibility)).body;
  const ids = (res) => (res.body.posts || res.body).map((p) => p.id);

  // me; friend (follows me, on my list); follower (follows me, not listed);
  // stranger.
  async function world() {
    const me = await registerAndLogin(app);
    const friend = await registerAndLogin(app);
    const follower = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    await follow(friend, me);
    await follow(follower, me);
    expect((await add(me, friend)).status).toBe(200);
    return { me, friend, follower, stranger };
  }

  it('the list: add people who follow you, search them, remove; private to you', async () => {
    const { me, friend, follower, stranger } = await world();
    expect((await request(app).get('/close-friends').set(auth(me))).body.closeFriends.map((u) => u.id)).toEqual([friend.id]);
    const candidates = (await request(app).get('/close-friends/candidates').set(auth(me))).body.candidates;
    expect(candidates.map((u) => u.id)).toEqual([follower.id]);
    expect((await request(app).get(`/close-friends/candidates?q=${follower.username.slice(0, 4)}`).set(auth(me))).body.candidates.map((u) => u.id)).toEqual([follower.id]);
    expect((await request(app).get('/close-friends/candidates?q=zzzz').set(auth(me))).body.candidates).toEqual([]);

    const notFollower = await add(me, stranger);
    expect([notFollower.status, notFollower.text]).toEqual([400, 'You can add people who follow you']);
    const self = await add(me, me);
    expect([self.status, self.text]).toEqual([400, "You can't add yourself"]);
    expect((await add(me, friend)).status).toBe(200); // idempotent
    expect((await request(app).delete(`/close-friends/${friend.id}`).set(auth(me))).status).toBe(200);
    expect((await request(app).get('/close-friends').set(auth(me))).body.closeFriends).toEqual([]);
    expect((await request(app).get('/close-friends').set(auth(friend))).body.closeFriends).toEqual([]);
    expect((await request(app).get('/close-friends')).status).toBe(401);
  });

  it('a close-friends post: the author and listed people only -- everywhere', async () => {
    const { me, friend, follower, stranger } = await world();
    await follow(me, friend); // so a story/feed from friend works later
    const p = await post(me, 'just for you #inner');
    expect(p.visibility).toBe('close_friends');

    const can = async (user) => (await request(app).get(`/posts/${p.id}`).set(auth(user))).status;
    expect([await can(me), await can(friend), await can(follower), await can(stranger)]).toEqual([200, 200, 404, 404]);
    expect((await request(app).get(`/posts/${p.id}`)).status).toBe(404);

    // Home: the listed follower sees it; the other follower doesn't.
    expect(ids(await request(app).get('/feed').set(auth(friend)))).toContain(p.id);
    expect(ids(await request(app).get('/feed').set(auth(follower)))).not.toContain(p.id);
    // Profile, hashtag, search, comments, reactions follow the same rule.
    expect(ids(await request(app).get(`/users/${me.id}/posts`).set(auth(friend)))).toContain(p.id);
    expect(ids(await request(app).get(`/users/${me.id}/posts`).set(auth(follower)))).not.toContain(p.id);
    expect(ids(await request(app).get('/hashtags/inner/posts').set(auth(friend)))).toEqual([p.id]);
    expect(ids(await request(app).get('/hashtags/inner/posts').set(auth(follower)))).toEqual([]);
    expect(ids(await request(app).get('/search/posts?q=just for you').set(auth(friend)))).toContain(p.id);
    expect(ids(await request(app).get('/search/posts?q=just for you').set(auth(follower)))).not.toContain(p.id);
    expect((await request(app).post(`/posts/${p.id}/comments`).set(auth(follower)).send({ content: 'hi' })).status).toBe(404);
    expect((await request(app).post(`/posts/${p.id}/like`).set(auth(friend))).status).toBeLessThan(300);

    // Taken off the list: gone for them too (saved copy included).
    await request(app).post(`/posts/${p.id}/bookmark`).set(auth(friend));
    await request(app).delete(`/close-friends/${friend.id}`).set(auth(me));
    expect(await can(friend)).toBe(404);
    expect(ids(await request(app).get('/bookmarks').set(auth(friend)))).toEqual([]);
  });

  it('mentions and notification snippets respect it', async () => {
    const { me, friend, follower } = await world();
    const p = await post(me, `hey @${friend.username} and @${follower.username}`);
    const notes = async (u) => (await request(app).get('/notifications').set(auth(u))).body.notifications.filter((n) => n.type === 'mention');
    expect((await notes(friend)).map((n) => n.post_content)).toEqual([p.content]);
    expect(await notes(follower)).toEqual([]);
  });

  it('switching a post to close friends, and the limits on where it applies', async () => {
    const { me, friend, follower } = await world();
    const p = await post(me, 'was public', 'public');
    expect((await request(app).put(`/posts/${p.id}`).set(auth(me)).send({ visibility: 'close_friends' })).body.visibility).toBe('close_friends');
    expect((await request(app).get(`/posts/${p.id}`).set(auth(follower))).status).toBe(404);
    expect((await request(app).get(`/posts/${p.id}`).set(auth(friend))).status).toBe(200);
    // Not inside a group (the group decides who sees it).
    const group = (await request(app).post('/communities').set(auth(me)).send({ name: 'Mine', privacy: 'public' })).body;
    const inGroup = await request(app).post('/posts').set(auth(me)).field('content', 'x').field('visibility', 'close_friends').field('communityId', String(group.id));
    expect([inGroup.status, inGroup.text]).toEqual([400, "Group and page posts don't have their own audience"]);
    // A draft can be for close friends.
    const draft = await request(app).post('/drafts').set(auth(me)).field('content', 'later').field('visibility', 'close_friends');
    expect(draft.body.visibility).toBe('close_friends');
  });

  it('a close-friends story: only listed followers see it in their tray', async () => {
    const { me, friend, follower } = await world();
    const story = (await request(app).post('/stories').set(auth(me)).field('closeFriends', 'true')
      .attach('image', png, { filename: 's.png', contentType: 'image/png' })).body;
    expect(story.close_friends).toBe(true);
    const tray = async (u) => (await request(app).get('/stories').set(auth(u))).body;
    const friendTray = await tray(friend);
    expect(friendTray.map((g) => g.user_id)).toEqual([me.id]);
    expect(friendTray[0].stories[0].close_friends).toBe(true);
    expect((await tray(follower)).map((g) => g.user_id)).toEqual([]);
    expect((await request(app).post(`/stories/${story.id}/view`).set(auth(follower))).status).toBe(404);
    // An ordinary story still reaches every follower.
    await request(app).post('/stories').set(auth(me)).attach('image', png, { filename: 's.png', contentType: 'image/png' });
    expect((await tray(follower)).map((g) => g.stories.length)).toEqual([1]);
  });

  it('the data download lists your close friends; deleting an account removes it from lists', async () => {
    const { me, friend } = await world();
    expect((await request(app).get('/profile/export').set(auth(me))).body.connections.close_friends.map((u) => u.username)).toEqual([friend.username]);
    await pool.query('DELETE FROM users WHERE id = $1', [friend.id]);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM close_friends')).rows[0].n).toBe(0);
  });

  it('rolling back migration 057 never makes anything MORE visible', async () => {
    const { me } = await world();
    const p = await post(me, 'secret circle');
    await request(app).post('/stories').set(auth(me)).field('closeFriends', 'true').attach('image', png, { filename: 's.png', contentType: 'image/png' });
    const sql = (dir) => fs.readFileSync(path.join(__dirname, '../../migrations', `057_add_close_friends.${dir}.sql`), 'utf8');
    await pool.query(sql('down'));
    expect((await pool.query('SELECT visibility FROM posts WHERE id = $1', [p.id])).rows[0].visibility).toBe('only_me');
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM stories')).rows[0].n).toBe(0);
    await pool.query(sql('up'));
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM close_friends")).rows[0].n).toBe(0);
  });
});
