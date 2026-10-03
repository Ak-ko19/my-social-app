// Day 19: link previews -- the title / description / site name of a web
// page whose link is in a post or message. The server fetches the page
// itself (so readers' browsers never contact the site), which makes it an
// SSRF target; every safeguard here is deliberate:
//   - http/https only, standard ports only, no user:password@ URLs;
//   - the host is resolved HERE and every address must be public
//     (ssrfGuard), and the connection is pinned to that checked address,
//     so a DNS answer can't switch to an internal one in between;
//   - redirects are followed by hand (max 3), each hop checked again;
//   - 5 s for the whole thing, at most 512 KB read, HTML only.
// Results (and failures, briefly) are cached in link_previews.
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const crypto = require('crypto');
const db = require('../db');
const { isPublicAddress } = require('./ssrfGuard');
const { isProduction } = require('../config/runtime');

const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2048;
const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED_TTL_MS = 60 * 60 * 1000;
const USER_AGENT = 'MySocialAppLinkPreview/1.0 (+link preview fetcher)';

class PreviewError extends Error {}

// The URL to fetch, normalised, or null if it may not be fetched at all.
function normalizeUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && !['80', '443'].includes(url.port) && url.origin !== testOrigin()) return null;
  if (!url.hostname) return null;
  url.hash = '';
  return url.href;
}

// dns.lookup that only ever hands back public addresses -- and refuses the
// host outright if ANY of its addresses isn't (a name that also points
// inside is not one we connect to). `isAllowed` is swappable for tests.
function guardedLookup(isAllowed) {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses.length || !addresses.every((a) => isAllowed(a.address))) {
        return callback(new PreviewError(`blocked address for ${hostname}`));
      }
      if (options && options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function requestOnce(url, { isAllowed, deadline }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    // An IP literal never goes through `lookup`, so check it here.
    const literal = target.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(literal) && !isAllowed(literal)) {
      reject(new PreviewError('blocked address'));
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new PreviewError('timeout'));
      return;
    }
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.get(
      target,
      {
        lookup: guardedLookup(isAllowed),
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9', 'Accept-Encoding': 'identity' },
        timeout: remaining
      },
      (res) => resolve({ res, req })
    );
    const timer = setTimeout(() => req.destroy(new PreviewError('timeout')), remaining);
    req.on('close', () => clearTimeout(timer));
    req.on('timeout', () => req.destroy(new PreviewError('timeout')));
    req.on('error', reject);
  });
}

function readBody(res, deadline) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => {
      res.destroy();
      reject(new PreviewError('timeout'));
    }, Math.max(0, deadline - Date.now()));
    res.on('data', (chunk) => {
      size += chunk.length;
      chunks.push(chunk);
      // The <head> (all a preview needs) comes first: stop at the limit
      // and use what arrived.
      if (size >= MAX_BYTES) {
        clearTimeout(timer);
        res.destroy();
        resolve(Buffer.concat(chunks).subarray(0, MAX_BYTES));
      }
    });
    res.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    res.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function decodeBody(buffer, contentType) {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType || '');
  try {
    return new TextDecoder(charset ? charset[1] : 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

// Fetches an HTML page within all the limits above. Returns { url, html }
// (url = after redirects) or throws. The two policies are swappable only so
// tests can reach a local test server; production uses the defaults.
async function fetchHtml(startUrl, { isAllowed = isPublicAddress, normalize = normalizeUrl } = {}) {
  const deadline = Date.now() + TIMEOUT_MS;
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const { res } = await requestOnce(url, { isAllowed, deadline });
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      const next = normalize(new URL(res.headers.location, url).href);
      if (!next) throw new PreviewError('bad redirect');
      url = next;
      continue;
    }
    if (res.statusCode !== 200) {
      res.resume();
      throw new PreviewError(`status ${res.statusCode}`);
    }
    const type = res.headers['content-type'] || '';
    if (!/^\s*(text\/html|application\/xhtml\+xml)/i.test(type)) {
      res.resume();
      throw new PreviewError('not html');
    }
    const body = await readBody(res, deadline);
    return { url, html: decodeBody(body, type) };
  }
  throw new PreviewError('too many redirects');
}

// ---- HTML -> preview ----
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function clean(text, max) {
  if (!text) return null;
  const value = decodeEntities(text)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function parsePreview(html) {
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    }
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && meta[key] === undefined) meta[key] = attrs.content;
  }
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = clean(meta['og:title'] || meta['twitter:title'] || (titleTag && titleTag[1]), 200);
  const description = clean(meta['og:description'] || meta['twitter:description'] || meta.description, 300);
  const siteName = clean(meta['og:site_name'], 100);
  if (!title && !description) return null;
  return { title, description, siteName };
}

// ---- cache + public entry point ----
const hashUrl = (url) => crypto.createHash('sha256').update(url).digest('hex');

// The browser suites (e2e/) serve test pages from a local stub site, which
// the rules above rightly refuse. LINK_PREVIEW_TEST_ORIGIN (e.g.
// http://127.0.0.1:3902) lets exactly that origin through -- never in
// production, and never anything else on loopback.
function testOrigin() {
  const value = process.env.LINK_PREVIEW_TEST_ORIGIN;
  if (!value || isProduction()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function fetchForTests(url) {
  const origin = testOrigin();
  if (origin && new URL(url).origin === origin) {
    const host = new URL(origin).hostname;
    return fetchHtml(url, { isAllowed: (ip) => ip === host, normalize: (u) => (new URL(u).origin === origin ? u : null) });
  }
  return fetchHtml(url);
}

// Swappable in tests (the real one would never reach a test server).
const deps = { fetchHtml: fetchForTests };

// { url, title, description, siteName } or null (nothing to show).
async function getPreview(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return null;
  const key = hashUrl(url);
  const cached = (await db.query('SELECT ok, title, description, site_name, fetched_at FROM link_previews WHERE url_hash = $1', [key])).rows[0];
  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < (cached.ok ? OK_TTL_MS : FAILED_TTL_MS)) {
      return cached.ok ? { url, title: cached.title, description: cached.description, siteName: cached.site_name } : null;
    }
  }
  let preview = null;
  try {
    const page = await deps.fetchHtml(url);
    preview = parsePreview(page.html);
  } catch {
    preview = null; // unreachable, blocked, not HTML, too slow...: no card
  }
  await db.query(
    `INSERT INTO link_previews (url_hash, url, ok, title, description, site_name, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (url_hash) DO UPDATE SET ok = $3, title = $4, description = $5, site_name = $6, fetched_at = now()`,
    [key, url, Boolean(preview), preview?.title ?? null, preview?.description ?? null, preview?.siteName ?? null]
  );
  return preview && { url, ...preview };
}

module.exports = { normalizeUrl, fetchHtml, fetchForTests, parsePreview, getPreview, deps, PreviewError, MAX_BYTES, TIMEOUT_MS };
