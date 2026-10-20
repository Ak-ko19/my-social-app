// Serves a production build of the frontend the way Vercel does, so the
// browser suites can run against the real bundle AND the real security
// headers from frontend/vercel.json (CSP violations then show up as
// console errors, which fail every suite).
//
//   node serve-dist.cjs <distDir> [port=5173] [localApi=http://localhost:3000]
//
// Same as Vercel: a file that exists is served, anything else falls back to
// index.html (the SPA rewrite); every "headers" entry whose source matches
// the path is applied, in order.
// One deliberate difference: the production API origin in the CSP's
// connect-src is swapped for the local API, since that's what this build
// talks to. Nothing else in the policy changes.
const fs = require('fs');
const http = require('http');
const path = require('path');

const [distArg, portArg, apiArg] = process.argv.slice(2);
if (!distArg) {
  console.error('usage: node serve-dist.cjs <distDir> [port] [localApi]');
  process.exit(1);
}
const DIST = path.resolve(distArg);
const PORT = Number(portArg || 5173);
const LOCAL_API = new URL(apiArg || 'http://localhost:3000');
const FRONTEND = path.join(__dirname, '..', 'frontend');

const vercel = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'vercel.json'), 'utf8'));
const prodApiLine = fs.readFileSync(path.join(FRONTEND, '.env.production'), 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('VITE_API_URL='));
const PROD_API = new URL(prodApiLine.slice('VITE_API_URL='.length).trim());
const wsOf = (url) => `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;

// vercel.json only uses "/prefix/(.*)"-style sources: escape everything,
// then turn the escaped "(.*)" back into a wildcard.
const sourceToRegExp = (source) =>
  new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\(\\.\\*\\)', '(.*)')}$`);
const headerRules = (vercel.headers || []).map((entry) => ({
  test: sourceToRegExp(entry.source),
  // Every header that names the production API points at the local one
  // instead (the CSP, and since Day 75 Reporting-Endpoints -- else a test
  // run's CSP reports would go to the live server).
  headers: entry.headers.map(({ key, value }) => ({
    key,
    value: value.replaceAll(PROD_API.origin, LOCAL_API.origin).replaceAll(wsOf(PROD_API), wsOf(LOCAL_API))
  }))
}));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

// Day 19: rewrites to an external URL with "has" header conditions (share
// cards: crawlers on /posts/:id go to the API). The production API origin
// becomes the local one, like the CSP above. ":name" sources only.
const externalRewrites = (vercel.rewrites || [])
  .filter((r) => /^https?:\/\//.test(r.destination))
  .map((r) => ({
    test: new RegExp(`^${r.source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
    has: (r.has || []).filter((h) => h.type === 'header').map((h) => ({ key: h.key.toLowerCase(), value: new RegExp(h.value) })),
    destination: r.destination.replace(PROD_API.origin, LOCAL_API.origin)
  }));

function externalRewrite(req, urlPath) {
  for (const rule of externalRewrites) {
    const match = rule.test.exec(urlPath);
    if (!match) continue;
    if (!rule.has.every((h) => h.value.test(req.headers[h.key] || ''))) continue;
    return rule.destination.replace(/:(\w+)/g, (whole, name) => (match.groups && name in match.groups ? encodeURIComponent(match.groups[name]) : whole));
  }
  return null;
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const proxyTo = externalRewrite(req, urlPath);
  if (proxyTo) {
    http.get(proxyTo, { headers: { 'user-agent': req.headers['user-agent'] || '' } }, (upstream) => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    }).on('error', () => {
      res.writeHead(502);
      res.end();
    });
    return;
  }
  let file = path.join(DIST, urlPath);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html');
  }
  for (const rule of headerRules) {
    if (rule.test.test(urlPath)) for (const { key, value } of rule.headers) res.setHeader(key, value);
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`serve-dist: ${DIST} on http://localhost:${PORT} (API ${LOCAL_API.origin})`));
