// Checks vercel.json's security headers against the built app (run after
// `npm run build`; CI does). The Content-Security-Policy has to stay in sync
// with two things that change independently:
//   - the inline theme script in index.html, allowed by its sha256 hash: an
//     edit without a new hash would silently block it in production (the
//     page would flash the wrong theme);
//   - the API origin in .env.production: the app must be allowed to call
//     it over https (REST) and wss (Socket.io).
// Usage: node scripts/check-headers.cjs
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const problems = [];

const vercel = JSON.parse(read('vercel.json'));
const all = (vercel.headers || []).find((entry) => entry.source === '/(.*)');
if (!all) {
  console.error('check:headers: vercel.json has no headers entry for "/(.*)".');
  process.exit(1);
}
const headers = Object.fromEntries(all.headers.map((h) => [h.key.toLowerCase(), h.value]));

const csp = headers['content-security-policy'] || '';
const directives = Object.fromEntries(
  csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...values] = d.split(/\s+/);
    return [name, values];
  })
);
if (!csp) problems.push('Content-Security-Policy is missing.');

// 1. Inline scripts in the BUILT page, hashed exactly as the browser does.
if (!fs.existsSync(path.join(root, 'dist/index.html'))) {
  console.error('check:headers: dist/index.html not found -- run `npm run build` first.');
  process.exit(1);
}
if (read('index.html').includes('\r')) {
  problems.push('index.html has CRLF line endings; the CSP hash only matches LF (see frontend/.gitattributes).');
}
const inline = [...read('dist/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const expected = inline.map((code) => `'sha256-${crypto.createHash('sha256').update(code, 'utf8').digest('base64')}'`);
const scriptSrc = directives['script-src'] || [];
const listed = scriptSrc.filter((v) => v.startsWith("'sha256-"));
for (const hash of expected) {
  if (!listed.includes(hash)) problems.push(`script-src is missing the inline script's hash ${hash}.`);
}
for (const hash of listed) {
  if (!expected.includes(hash)) problems.push(`script-src lists ${hash}, which matches no inline script (stale?).`);
}
if (scriptSrc.some((v) => v === "'unsafe-inline'" || v === "'unsafe-eval'")) {
  problems.push("script-src must not allow 'unsafe-inline' or 'unsafe-eval'.");
}

// 2. The API the production build calls.
const apiLine = read('.env.production').split(/\r?\n/).find((l) => l.startsWith('VITE_API_URL='));
const api = new URL(apiLine.slice('VITE_API_URL='.length).trim());
const connect = directives['connect-src'] || [];
for (const origin of [api.origin, `${api.protocol === 'https:' ? 'wss' : 'ws'}://${api.host}`]) {
  if (!connect.includes(origin)) problems.push(`connect-src is missing ${origin} (from .env.production).`);
}

// 3. The rest of the policy and the other headers.
const must = {
  "default-src 'self'": (directives['default-src'] || []).join(' ') === "'self'",
  "object-src 'none'": (directives['object-src'] || []).join(' ') === "'none'",
  "frame-ancestors 'none'": (directives['frame-ancestors'] || []).join(' ') === "'none'",
  "base-uri 'self'": (directives['base-uri'] || []).join(' ') === "'self'",
  'X-Frame-Options: DENY': headers['x-frame-options'] === 'DENY',
  'X-Content-Type-Options: nosniff': headers['x-content-type-options'] === 'nosniff',
  'Referrer-Policy': Boolean(headers['referrer-policy']),
  'Permissions-Policy allows the microphone (voice messages)': /microphone=\(self\)/.test(headers['permissions-policy'] || ''),
  'Cross-Origin-Opener-Policy': Boolean(headers['cross-origin-opener-policy'])
};
for (const [name, ok] of Object.entries(must)) if (!ok) problems.push(`Missing or wrong: ${name}.`);

if (problems.length > 0) {
  console.error(`check:headers failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`headers OK: CSP (${Object.keys(directives).length} directives, ${expected.length} inline script hash), API ${api.host}, ${Object.keys(headers).length} headers`);
