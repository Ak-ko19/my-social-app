const request = require('supertest');
const { setupTestApp } = require('../helpers/setupTestApp');
const { pool } = require('../helpers/testDb');

// Day 75: browsers report Content-Security-Policy violations to
// POST /csp-reports, and they land in Admin > Errors (source "client").
describe('CSP violation reports', () => {
  const { app, reset } = setupTestApp();
  const errorLog = require('../../services/errorLogService');
  beforeEach(async () => {
    await reset();
    errorLog.resetThrottle();
  });
  const logged = async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await errorLog.whenIdle();
    return (await pool.query("SELECT route, message FROM error_groups WHERE source = 'client' ORDER BY route, message")).rows;
  };
  const send = (type, payload) => request(app).post('/csp-reports').set('Content-Type', type).send(JSON.stringify(payload));

  it('takes the report-uri format, keeping only the origin, the directive and the page path', async () => {
    const res = await send('application/csp-report', { 'csp-report': {
      'document-uri': 'https://app.example/posts/123?token=secret#x',
      'effective-directive': 'script-src-elem',
      'violated-directive': 'script-src',
      'blocked-uri': 'https://evil.example/steal.js?who=me'
    } });
    expect(res.status).toBe(204);
    expect(await logged()).toEqual([{ route: 'csp /posts/<n>', message: 'CSP blocked https://evil.example (script-src-elem)' }]);
  });

  it('takes the Reporting API format, an inline block included', async () => {
    const res = await send('application/reports+json', [
      { type: 'csp-violation', body: { documentURL: 'https://app.example/', effectiveDirective: 'script-src-elem', blockedURL: 'inline' } },
      { type: 'csp-violation', body: { documentURL: 'https://app.example/messages', effectiveDirective: 'img-src', blockedURL: 'https://img.example/a.png' } },
      { type: 'deprecation', body: { id: 'x' } }
    ]);
    expect(res.status).toBe(204);
    expect(await logged()).toEqual([
      { route: 'csp /', message: 'CSP blocked inline (script-src-elem)' },
      { route: 'csp /messages', message: 'CSP blocked https://img.example (img-src)' }
    ]);
  });

  it("skips browser extensions' violations and anything that isn't a report -- always 204", async () => {
    const answers = [
      await send('application/csp-report', { 'csp-report': { 'document-uri': 'https://app.example/', 'effective-directive': 'script-src', 'blocked-uri': 'chrome-extension://abc/inject.js' } }),
      await send('application/reports+json', [{ type: 'csp-violation', body: { documentURL: 'https://app.example/', effectiveDirective: 'style-src', blockedURL: 'inline', sourceFile: 'moz-extension://x/c.js' } }]),
      await send('application/csp-report', { hello: 'world' }),
      await send('application/reports+json', { not: 'a list' })
    ];
    expect(answers.map((r) => r.status)).toEqual([204, 204, 204, 204]);
    expect(await logged()).toEqual([]);
  });
});
