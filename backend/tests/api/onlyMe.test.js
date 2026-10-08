const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 20: "only me" posts are seen by their author and nobody else --
// checked on every way a post can be read.
describe('"only me" posts (Day 20)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const { pool } = require('../helpers/testDb');

  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  const newPost = async (user, content, visibility) => {
    const req = request(app).post('/posts').set(auth(user)).field('content', content);
    if (visibility) req.field('visibility', visibility);
    return req;
  };
  const contents = (res) => {
    const body = res.body;
    const list = Array.isArray(body) ? body : body.posts || body.results?.posts || body.bookmarks || [];
    return list.map((p) => p.content);
  };

  let author;
  let follower;
  let stranger;
  let secret;

  beforeEach(async () => {
    author = await registerAndLogin(app, { username: `auth${Date.now() % 100000}` });
    follower = await registerAndLogin(app);
    stranger = await registerAndLogin(app);
    await request(app).post(`/users/${author.id}/follow`).set(auth(follower));
    const res = await newPost(author, 'my secret diary #diary', 'only_me');
    expect(res.status).toBe(201);
    expect(res.body.visibility).toBe('only_me');
    secret = res.body;
  });

  it('the author sees it everywhere they look', async () => {
    expect(contents(await request(app).get('/feed').set(auth(author)))).toContain('my secret diary #diary');
    expect(contents(await request(app).get(`/users/${author.id}/posts`).set(auth(author)))).toContain('my secret diary #diary');
    expect((await request(app).get(`/posts/${secret.id}`).set(auth(author))).status).toBe(200);
  });

  it('a follower does not: feed, all posts, profile, post page', async () => {
    expect(contents(await request(app).get('/feed').set(auth(follower)))).not.toContain('my secret diary #diary');
    expect(contents(await request(app).get('/posts').set(auth(follower)))).not.toContain('my secret diary #diary');
    expect(contents(await request(app).get(`/users/${author.id}/posts`).set(auth(follower)))).not.toContain('my secret diary #diary');
    expect((await request(app).get(`/posts/${secret.id}`).set(auth(follower))).status).toBe(404);
  });

  it('nor anyone through hashtags, search or explore (while a public post shows up there)', async () => {
    // Positive control: proves each endpoint really lists posts, so the
    // "not there" checks below can't pass just because a path is wrong.
    const pub = (await newPost(author, 'my public diary #diary')).body;
    // Explore lists posts with some engagement -- give both posts some, so
    // the secret one would show up there if it weren't filtered out.
    await request(app).post(`/posts/${pub.id}/like`).set(auth(stranger));
    expect((await request(app).post(`/posts/${secret.id}/like`).set(auth(author))).status).toBeLessThan(300);
    for (const viewer of [follower, stranger]) {
      const tag = JSON.stringify((await request(app).get('/hashtags/diary/posts').set(auth(viewer))).body);
      const search = JSON.stringify((await request(app).get('/search/posts').query({ q: 'diary' }).set(auth(viewer))).body);
      const explore = JSON.stringify((await request(app).get('/explore/posts').set(auth(viewer))).body);
      for (const body of [tag, search, explore]) {
        expect(body).toContain('my public diary');
        expect(body).not.toContain('my secret diary');
      }
    }
    const anonymous = JSON.stringify((await request(app).get('/search/posts').query({ q: 'diary' })).body);
    expect(anonymous).toContain('my public diary');
    expect(anonymous).not.toContain('my secret diary');
  });

  it('nor through likes, comments or bookmarks (all 404)', async () => {
    expect((await request(app).post(`/posts/${secret.id}/like`).set(auth(follower))).status).toBe(404);
    expect((await request(app).post(`/posts/${secret.id}/comments`).set(auth(follower)).send({ content: 'hi' })).status).toBe(404);
    expect((await request(app).get(`/posts/${secret.id}/comments`).set(auth(follower))).status).toBe(404);
    expect((await request(app).post(`/posts/${secret.id}/bookmark`).set(auth(follower))).status).toBe(404);
  });

  it('a public post bookmarked before it became "only me" drops out of the bookmarks list', async () => {
    const post = (await newPost(author, 'soon private')).body;
    expect((await request(app).post(`/posts/${post.id}/bookmark`).set(auth(follower))).status).toBeLessThan(300);
    expect(contents(await request(app).get('/bookmarks').set(auth(follower)))).toContain('soon private');
    expect((await request(app).put(`/posts/${post.id}`).set(auth(author)).send({ visibility: 'only_me' })).status).toBe(200);
    expect(contents(await request(app).get('/bookmarks').set(auth(follower)))).not.toContain('soon private');
  });

  it('nor through a share card', async () => {
    const res = await request(app).get(`/share/posts/${secret.id}`);
    expect(res.text).not.toContain('secret diary');
  });

  it('mentions in it notify nobody; in a followers-only post only followers', async () => {
    await newPost(author, `note to self @${follower.username} @${stranger.username}`, 'only_me');
    await newPost(author, `for followers @${follower.username} @${stranger.username}`, 'followers');
    const notes = async (u) => (await request(app).get('/notifications').set(auth(u))).body.notifications.filter((n) => n.type === 'mention');
    const followerNotes = await notes(follower);
    expect(followerNotes.map((n) => n.post_content)).toEqual([`for followers @${follower.username} @${stranger.username}`]);
    expect(await notes(stranger)).toEqual([]);
  });

  it('a notification about a post that later became "only me" no longer shows its text', async () => {
    const post = (await newPost(author, `hey @${follower.username}`)).body;
    await request(app).put(`/posts/${post.id}`).set(auth(author)).send({ visibility: 'only_me' });
    const [note] = (await request(app).get('/notifications').set(auth(follower))).body.notifications;
    expect(note.type).toBe('mention');
    expect(note.post_content).toBeNull();
  });

  it('the author can switch it back to public', async () => {
    expect((await request(app).put(`/posts/${secret.id}`).set(auth(author)).send({ visibility: 'public' })).status).toBe(200);
    expect((await request(app).get(`/posts/${secret.id}`).set(auth(stranger))).status).toBe(200);
  });

  it('not for group posts', async () => {
    const c = (await pool.query("INSERT INTO communities (name, created_by) VALUES ('Club', $1) RETURNING id", [author.id])).rows[0];
    await pool.query("INSERT INTO community_members (community_id, user_id, role, status) VALUES ($1, $2, 'admin', 'member')", [c.id, author.id]);
    const res = await request(app).post('/posts').set(auth(author)).field('content', 'x').field('visibility', 'only_me').field('communityId', String(c.id));
    expect(res.status).toBe(400);
  });

  it('unknown audiences are still refused', async () => {
    const res = await newPost(author, 'x', 'friends');
    expect(res.status).toBe(400);
    expect(res.text).toBe('visibility must be one of: public, followers, close_friends, only_me');
  });
});
