const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');

// Day 68: the API reference -- GET /openapi.json and the GET /docs page.
describe('API docs (GET /openapi.json, GET /docs)', () => {
  const { app } = setupTestApp();
  const env = { ...process.env };
  afterEach(() => {
    process.env.NODE_ENV = env.NODE_ENV;
    if (env.API_DOCS === undefined) delete process.env.API_DOCS;
    else process.env.API_DOCS = env.API_DOCS;
  });

  it('serves the spec: every documented route, OpenAPI 3.1', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    const operations = Object.values(res.body.paths).reduce((n, ops) => n + Object.keys(ops).length, 0);
    expect(operations).toBeGreaterThan(190);
    expect(res.body.paths['/posts/{id}'].get.summary).toBeTruthy();
  });

  it('serves the page with its scripts as files (the CSP allows no inline script)', async () => {
    const page = await request(app).get('/docs');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.headers['content-security-policy']).toMatch(/script-src 'self'/);
    const scripts = page.text.match(/<script[^>]*>/g);
    expect(scripts).toEqual(['<script src="/docs/assets/swagger-ui-bundle.js">', '<script src="/docs/init.js">']);
    expect(page.text).not.toMatch(/<script>\s*\S/);

    for (const [url, type] of [['/docs/init.js', /javascript/], ['/docs/assets/swagger-ui-bundle.js', /javascript/], ['/docs/assets/swagger-ui.css', /css/]]) {
      const res = await request(app).get(url);
      expect([url, res.status]).toEqual([url, 200]);
      expect(res.headers['content-type']).toMatch(type);
    }
    const init = await request(app).get('/docs/init.js');
    expect(init.text).toContain("url: '/openapi.json'");
  });

  it("serves only the two package files the page uses, not the package's demo page", async () => {
    for (const url of ['/docs/assets/index.html', '/docs/assets/swagger-initializer.js', '/docs/assets/', '/docs/assets/../package.json']) {
      expect([url, (await request(app).get(url)).status]).toEqual([url, 404]);
    }
  });

  it('is off in production unless API_DOCS=1', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.API_DOCS;
    for (const url of ['/openapi.json', '/docs', '/docs/init.js', '/docs/assets/swagger-ui.css']) {
      expect([url, (await request(app).get(url)).status]).toEqual([url, 404]);
    }
    process.env.API_DOCS = '1';
    expect((await request(app).get('/openapi.json')).status).toBe(200);
    expect((await request(app).get('/docs')).status).toBe(200);
  });
});
