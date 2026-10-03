const http = require('http');
const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { registerAndLogin } = require('../helpers/auth');
const { isPublicAddress } = require('../../services/ssrfGuard');
// Required lazily (inside tests): loaded at the top it would bind the real
// db module before setupTestApp() below mocks it.
const svc = () => require('../../services/linkPreviewService');
const normalizeUrl = (...a) => svc().normalizeUrl(...a);
const parsePreview = (...a) => svc().parsePreview(...a);
const fetchHtml = (...a) => svc().fetchHtml(...a);

// Day 19: link previews. The server fetches pages users link to, so most
// of this file is about what it must NOT fetch.

describe('SSRF guard: only public addresses', () => {
  it.each([
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1', '2002:7f00:1::1', '2002:a9fe:a9fe::1',
    'localhost', '', 'not-an-ip'
  ])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2a00:1450:4001::200e'])(
    'allows %s', (ip) => expect(isPublicAddress(ip)).toBe(true)
  );
});

describe('normalizeUrl', () => {
  it('keeps plain http(s) URLs on standard ports, without the #fragment', () => {
    expect(normalizeUrl('https://example.com/a?b=1#top')).toBe('https://example.com/a?b=1');
    expect(normalizeUrl('http://example.com:80/')).toBe('http://example.com/');
    expect(normalizeUrl('https://example.com:443/x')).toBe('https://example.com/x');
  });

  it('refuses other schemes, credentials, odd ports and junk', () => {
    for (const bad of ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://x', 'https://user:pw@example.com/',
      'https://example.com:8080/', 'http://example.com:22', 'example.com', '/relative', '', null, 42, `https://e.com/${'a'.repeat(2100)}`]) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });
});

describe('parsePreview', () => {
  it('reads Open Graph tags, decoding entities and trimming', () => {
    const html = `<html><head>
      <meta property="og:title" content="  Tom &amp; Jerry &#8212; &#x41;BC  ">
      <meta content='A &quot;cat&quot; and a mouse' property='og:description'>
      <meta property=og:site_name content=Cartoons>
      <title>ignored</title></head></html>`;
    expect(parsePreview(html)).toEqual({ title: 'Tom & Jerry — ABC', description: 'A "cat" and a mouse', siteName: 'Cartoons' });
  });

  it('falls back to twitter:, <title> and meta description; caps lengths', () => {
    expect(parsePreview(`<title>Plain\n page</title><meta name="description" content="${'x'.repeat(400)}">`)).toEqual({
      title: 'Plain page', description: `${'x'.repeat(299)}…`, siteName: null
    });
    expect(parsePreview('<meta name="twitter:title" content="Tweet title">').title).toBe('Tweet title');
  });

  it('nothing usable -> null (no empty card)', () => {
    expect(parsePreview('<html><body>hello</body></html>')).toBeNull();
    expect(parsePreview('<title>   </title>')).toBeNull();
  });

  it('keeps Myanmar and Arabic text intact', () => {
    expect(parsePreview('<meta property="og:title" content="မင်္ဂလာပါ مرحبا">').title).toBe('မင်္ဂလာပါ مرحبا');
  });
});

describe('fetchHtml against a local test server', () => {
  let server;
  let base;
  const routes = {};
  beforeAll((done) => {
    server = http.createServer((req, res) => (routes[req.url] || ((q, r) => { r.writeHead(404); r.end(); }))(req, res));
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });
  afterAll((done) => {
    server.closeAllConnections?.();
    server.close(done);
  });

  // The test server is on loopback, which production refuses (see below).
  const loopbackOnly = { isAllowed: (ip) => ip === '127.0.0.1', normalize: (u) => u };
  const html = (body) => (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  };

  it('fetches an HTML page', async () => {
    routes['/page'] = html('<title>Hello</title>');
    const page = await fetchHtml(`${base}/page`, loopbackOnly);
    expect(page).toEqual({ url: `${base}/page`, html: '<title>Hello</title>' });
  });

  it('PRODUCTION RULES refuse this very server: loopback by IP and by name', async () => {
    routes['/page'] = html('<title>Hello</title>');
    await expect(fetchHtml(`${base}/page`)).rejects.toThrow(/blocked/);
    await expect(fetchHtml(`${base.replace('127.0.0.1', 'localhost')}/page`)).rejects.toThrow(/blocked/);
  });

  it('follows up to 3 redirects, and no more', async () => {
    routes['/r1'] = (q, r) => { r.writeHead(302, { Location: '/r2' }); r.end(); };
    routes['/r2'] = (q, r) => { r.writeHead(301, { Location: `${base}/r3` }); r.end(); };
    routes['/r3'] = (q, r) => { r.writeHead(307, { Location: '/final' }); r.end(); };
    routes['/final'] = html('<title>End</title>');
    expect((await fetchHtml(`${base}/r1`, loopbackOnly)).url).toBe(`${base}/final`);
    routes['/r0'] = (q, r) => { r.writeHead(302, { Location: '/r1' }); r.end(); };
    await expect(fetchHtml(`${base}/r0`, loopbackOnly)).rejects.toThrow(/too many redirects/);
  });

  it('re-checks every redirect: a hop to an internal address is refused', async () => {
    routes['/to-metadata'] = (q, r) => { r.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); r.end(); };
    await expect(fetchHtml(`${base}/to-metadata`, loopbackOnly)).rejects.toThrow(/blocked/);
    // ...and with the production URL policy a redirect to a non-standard
    // port (or another scheme) is refused before connecting at all.
    routes['/to-ftp'] = (q, r) => { r.writeHead(302, { Location: 'ftp://example.com/' }); r.end(); };
    await expect(fetchHtml(`${base}/to-ftp`, { isAllowed: loopbackOnly.isAllowed })).rejects.toThrow(/bad redirect/);
  });

  it('only HTML, only 200', async () => {
    routes['/json'] = (q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{}'); };
    routes['/gone'] = (q, r) => { r.writeHead(410, { 'Content-Type': 'text/html' }); r.end('<title>x</title>'); };
    await expect(fetchHtml(`${base}/json`, loopbackOnly)).rejects.toThrow(/not html/);
    await expect(fetchHtml(`${base}/gone`, loopbackOnly)).rejects.toThrow(/status 410/);
  });

  it('reads at most 512 KB of an endless page', async () => {
    routes['/huge'] = (q, r) => {
      r.writeHead(200, { 'Content-Type': 'text/html' });
      r.write('<title>Big</title>');
      const chunk = 'x'.repeat(64 * 1024);
      const pump = () => { while (r.write(chunk)) { /* fill */ } };
      r.on('drain', pump);
      pump();
    };
    const page = await fetchHtml(`${base}/huge`, loopbackOnly);
    expect(Buffer.byteLength(page.html)).toBeLessThanOrEqual(svc().MAX_BYTES);
    expect(page.html.startsWith('<title>Big</title>')).toBe(true);
  });

  it('gives up on a server that never answers (5 s)', async () => {
    routes['/hang'] = () => {};
    const started = Date.now();
    await expect(fetchHtml(`${base}/hang`, loopbackOnly)).rejects.toThrow(/timeout/);
    expect(Date.now() - started).toBeLessThan(7000);
  }, 10000);

  it('the browser suites\' test origin works outside production only, and only for that origin', async () => {
    routes['/stub'] = html('<title>Stub</title>');
    const saved = { origin: process.env.LINK_PREVIEW_TEST_ORIGIN, render: process.env.RENDER };
    try {
      process.env.LINK_PREVIEW_TEST_ORIGIN = base;
      expect((await svc().fetchForTests(`${base}/stub`)).html).toBe('<title>Stub</title>');
      expect(normalizeUrl(`${base}/stub`)).toBe(`${base}/stub`);
      // another port on the same loopback is still refused
      await expect(svc().fetchForTests('http://127.0.0.1:1/x')).rejects.toThrow(/blocked/);
      process.env.RENDER = 'true'; // production
      await expect(svc().fetchForTests(`${base}/stub`)).rejects.toThrow(/blocked/);
      expect(normalizeUrl(`${base}/stub`)).toBeNull();
    } finally {
      process.env.LINK_PREVIEW_TEST_ORIGIN = saved.origin;
      if (saved.render === undefined) delete process.env.RENDER;
      else process.env.RENDER = saved.render;
    }
  });

  it('decodes the page in its declared charset', async () => {
    routes['/latin1'] = (q, r) => {
      r.writeHead(200, { 'Content-Type': 'text/html; charset=iso-8859-1' });
      r.end(Buffer.from([0x3c, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x3e, 0x43, 0x61, 0x66, 0xe9, 0x3c, 0x2f, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x3e]));
    };
    expect((await fetchHtml(`${base}/latin1`, loopbackOnly)).html).toBe('<title>Café</title>');
  });
});

describe('GET /link-preview', () => {
  const { app, reset } = setupTestApp();
  const { pool } = require('../helpers/testDb');
  let user;
  let fetches;
  let page;

  beforeEach(async () => {
    await reset();
    user = await registerAndLogin(app);
    fetches = 0;
    page = { html: '<meta property="og:title" content="Example"><meta property="og:description" content="An example page">' };
    svc().deps.fetchHtml = async (url) => {
      fetches += 1;
      if (page instanceof Error) throw page;
      return { url, ...page };
    };
  });
  afterAll(() => {
    svc().deps.fetchHtml = svc().fetchHtml;
  });

  const get = (url, u = user) => request(app).get('/link-preview').query({ url }).set('Authorization', `Bearer ${u.token}`);

  it('returns the preview, then serves it from the cache', async () => {
    const first = await get('https://example.com/a#frag');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ url: 'https://example.com/a', title: 'Example', description: 'An example page', siteName: null });
    expect(first.headers['cache-control']).toBe('private, max-age=3600');
    expect((await get('https://example.com/a')).body.title).toBe('Example');
    expect(fetches).toBe(1);
  });

  it('a page with nothing to show (or that failed) -> 204, and the failure is cached for an hour', async () => {
    page = new Error('unreachable');
    expect((await get('https://down.example/')).status).toBe(204);
    expect((await get('https://down.example/')).status).toBe(204);
    expect(fetches).toBe(1);
    await pool.query("UPDATE link_previews SET fetched_at = now() - interval '61 minutes'");
    page = { html: '<title>Back up</title>' };
    expect((await get('https://down.example/')).body.title).toBe('Back up');
    expect(fetches).toBe(2);
  });

  it('a good preview is refreshed after 7 days', async () => {
    await get('https://example.com/b');
    await pool.query("UPDATE link_previews SET fetched_at = now() - interval '8 days'");
    page = { html: '<title>New title</title>' };
    expect((await get('https://example.com/b')).body.title).toBe('New title');
    expect(fetches).toBe(2);
  });

  it('refuses URLs it must not fetch, without fetching', async () => {
    for (const url of ['file:///etc/passwd', 'https://example.com:8443/', 'http://user:pw@example.com/', 'nope']) {
      const res = await get(url);
      expect(res.status).toBe(400);
    }
    expect((await request(app).get('/link-preview')).status).toBe(401);
    expect(fetches).toBe(0);
  });

  it('the real fetcher refuses internal addresses (no card, cached as a failure)', async () => {
    svc().deps.fetchHtml = svc().fetchHtml; // production policies
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://localhost/']) {
      expect((await get(url)).status).toBe(204);
    }
    const rows = (await pool.query('SELECT ok FROM link_previews')).rows;
    expect(rows.length).toBe(4);
    expect(rows.every((r) => r.ok === false)).toBe(true);
  });

  it('the daily cleanup drops month-old previews', async () => {
    await get('https://example.com/old');
    await get('https://example.com/new');
    await pool.query("UPDATE link_previews SET fetched_at = now() - interval '31 days' WHERE url = 'https://example.com/old'");
    const cleanup = require('../../services/cleanupService');
    expect((await cleanup.run({ dryRun: true })).linkPreviews).toBe(1);
    expect((await cleanup.run()).linkPreviews).toBe(1);
    expect((await pool.query('SELECT url FROM link_previews')).rows.map((r) => r.url)).toEqual(['https://example.com/new']);
  });
});
