const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');

// Day 19: Open Graph share cards for crawlers (GET /share/posts/:id).
describe('share cards (Day 19)', () => {
  const { app, reset } = setupTestApp();
  beforeEach(reset);
  const { pool } = require('../helpers/testDb');

  const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
  const newPost = async (user, content, fields = {}) => {
    const req = request(app).post('/posts').set(auth(user)).field('content', content);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return (await req).body;
  };
  const card = (id) => request(app).get(`/share/posts/${id}`);
  const tag = (html, key) => {
    const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html);
    return m ? m[1] : null;
  };
  const GENERIC = (res) => tag(res.text, 'og:title') === 'MySocialApp' && tag(res.text, 'og:description') === null;

  let bob;
  beforeEach(async () => {
    bob = await registerAndLogin(app, { username: `bob${Date.now() % 100000}` });
  });

  it('a public post: author, excerpt, the app URL, and a redirect for people', async () => {
    const post = await newPost(bob, 'Sunset at the beach\n\n  tonight');
    const res = await card(post.id);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(tag(res.text, 'og:title')).toBe(`${bob.username} on MySocialApp`);
    expect(tag(res.text, 'og:description')).toBe('Sunset at the beach tonight');
    expect(tag(res.text, 'og:url')).toBe(`http://localhost:5173/posts/${post.id}`);
    expect(tag(res.text, 'twitter:card')).toBe('summary');
    expect(res.text).toContain(`<meta http-equiv="refresh" content="0; url=http://localhost:5173/posts/${post.id}">`);
  });

  it('uses the first photo, and a large card for it', async () => {
    const post = await newPost(bob, 'Two photos');
    await pool.query(
      "INSERT INTO post_media (post_id, url, position) VALUES ($1, 'https://res.cloudinary.com/demo/image/upload/second.jpg', 1), ($1, 'https://res.cloudinary.com/demo/image/upload/first.jpg', 0)",
      [post.id]
    );
    const res = await card(post.id);
    expect(tag(res.text, 'og:image')).toBe('https://res.cloudinary.com/demo/image/upload/first.jpg');
    expect(tag(res.text, 'twitter:card')).toBe('summary_large_image');
  });

  it('cuts long text and escapes everything (no HTML injection into the page)', async () => {
    const post = await newPost(bob, `"><script>alert(1)</script> & 'quotes' ${'x'.repeat(300)}`);
    const res = await card(post.id);
    expect(res.text).not.toContain('<script>');
    const description = tag(res.text, 'og:description');
    expect(description.startsWith('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#39;quotes&#39;')).toBe(true);
    expect(description.endsWith('…')).toBe(true);
  });

  it('a page name with markup is escaped in the title too', async () => {
    const post = await newPost(bob, 'hi');
    const pageRow = (await pool.query(`INSERT INTO pages (name, owner_id) VALUES ('Cafe </title><script>x()</script>', $1) RETURNING id`, [bob.id])).rows[0];
    await pool.query('UPDATE posts SET page_id = $1 WHERE id = $2', [pageRow.id, post.id]);
    const res = await card(post.id);
    expect(res.text).not.toContain('<script>');
    expect(res.text).toContain('<title>Cafe &lt;/title&gt;&lt;script&gt;x()&lt;/script&gt; on MySocialApp</title>');
  });

  it('a page post is shown as the page', async () => {
    const post = await newPost(bob, 'From the page');
    const pageRow = (await pool.query("INSERT INTO pages (name, owner_id) VALUES ('Corner Cafe', $1) RETURNING id", [bob.id])).rows[0];
    await pool.query('UPDATE posts SET page_id = $1 WHERE id = $2', [pageRow.id, post.id]);
    expect(tag((await card(post.id)).text, 'og:title')).toBe('Corner Cafe on MySocialApp');
  });

  describe('profiles and pages (Day 24)', () => {
    const profileCard = (id) => request(app).get(`/share/profiles/${encodeURIComponent(id)}`);

    it('a public profile: name, bio, photo -- by id or by username', async () => {
      await pool.query("UPDATE users SET bio = 'Tea lover in Yangon', avatar_url = 'https://res.cloudinary.com/demo/image/upload/me.jpg' WHERE id = $1", [bob.id]);
      for (const id of [String(bob.id), bob.username, bob.username.toUpperCase()]) {
        const res = await profileCard(id);
        expect(tag(res.text, 'og:title')).toBe(`${bob.username} on MySocialApp`);
        expect(tag(res.text, 'og:description')).toBe('Tea lover in Yangon');
        expect(tag(res.text, 'og:image')).toBe('https://res.cloudinary.com/demo/image/upload/me.jpg');
      }
      expect(tag((await profileCard(bob.username)).text, 'og:url')).toBe(`http://localhost:5173/profile/${bob.username}`);
    });

    it('private, deactivated or missing accounts: the generic card, nothing about them', async () => {
      await pool.query("UPDATE users SET bio = 'secret bio', is_private = true WHERE id = $1", [bob.id]);
      let res = await profileCard(bob.id);
      expect(GENERIC(res)).toBe(true);
      expect(res.text).not.toContain('secret bio');
      await pool.query('UPDATE users SET is_private = false, is_deactivated = true WHERE id = $1', [bob.id]);
      expect(GENERIC(await profileCard(bob.id))).toBe(true);
      res = await profileCard('nobody-like-this');
      expect(GENERIC(res)).toBe(true);
      expect(GENERIC(await profileCard("x' OR '1'='1"))).toBe(true);
    });

    it('a page: its name and description; hidden when its owner is deactivated', async () => {
      const pageRow = (await pool.query("INSERT INTO pages (name, description, owner_id) VALUES ('Corner <Cafe>', 'Best mohinga', $1) RETURNING id", [bob.id])).rows[0];
      let res = await request(app).get(`/share/pages/${pageRow.id}`);
      expect(tag(res.text, 'og:title')).toBe('Corner &lt;Cafe&gt; on MySocialApp');
      expect(tag(res.text, 'og:description')).toBe('Best mohinga');
      expect(tag(res.text, 'og:url')).toBe(`http://localhost:5173/pages/${pageRow.id}`);
      await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [bob.id]);
      res = await request(app).get(`/share/pages/${pageRow.id}`);
      expect(GENERIC(res)).toBe(true);
      expect(res.text).not.toContain('mohinga');
      expect(GENERIC(await request(app).get('/share/pages/999999'))).toBe(true);
    });
  });

  describe('never reveals posts that are not public (same generic card as a missing one)', () => {
    it('followers-only post', async () => {
      const post = await newPost(bob, 'friends only', { visibility: 'followers' });
      const res = await card(post.id);
      expect(GENERIC(res)).toBe(true);
      expect(res.text).not.toContain('friends only');
    });

    it('private account', async () => {
      const post = await newPost(bob, 'private person');
      await pool.query('UPDATE users SET is_private = true WHERE id = $1', [bob.id]);
      expect(GENERIC(await card(post.id))).toBe(true);
    });

    it('deactivated or banned author', async () => {
      const post = await newPost(bob, 'gone soon');
      await pool.query('UPDATE users SET is_deactivated = true WHERE id = $1', [bob.id]);
      expect(GENERIC(await card(post.id))).toBe(true);
    });

    it('private community', async () => {
      const post = await newPost(bob, 'members only');
      const c = (await pool.query("INSERT INTO communities (name, privacy, created_by) VALUES ('Secret club', 'private', $1) RETURNING id", [bob.id])).rows[0];
      await pool.query('UPDATE posts SET community_id = $1 WHERE id = $2', [c.id, post.id]);
      expect(GENERIC(await card(post.id))).toBe(true);
    });

    it('missing or malformed ids', async () => {
      for (const id of ['999999', '0', '-1', 'abc', '1.5']) {
        const res = await card(id);
        expect(res.status).toBe(200);
        expect(GENERIC(res)).toBe(true);
      }
      expect(tag((await card('abc')).text, 'og:url')).toBe('http://localhost:5173/');
    });
  });
});
