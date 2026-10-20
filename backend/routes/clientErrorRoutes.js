const express = require('express');
const optionalAuth = require('../middleware/optionalAuth');
const { createLimiter } = require('../middleware/rateLimiter');
const { report, normalise } = require('../services/errorLogService');

const router = express.Router();

// Browsers report their crashes here (Day 10), so errors that only happen on
// someone's phone show up in the admin error log too. Public (a crash can
// happen before login), so: a tight per-IP limit, every field capped, and
// only the page PATH is kept -- never the query string, and long hex runs
// (like a reset-password token in the path) are normalised away.
const clientErrorLimiter = createLimiter({
  keyBy: 'ip',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many error reports.'
});

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

function pagePath(url) {
  try {
    return normalise(new URL(url, 'http://x').pathname).slice(0, 200);
  } catch {
    return null;
  }
}

router.post('/client-errors', clientErrorLimiter, optionalAuth, (req, res) => {
  const message = text(req.body.message, 500).trim();
  if (!message) return res.status(400).send('message is required');
  const kind = ['error', 'unhandledrejection', 'render'].includes(req.body.kind) ? req.body.kind : 'error';
  report(new Error(message), {
    source: 'client',
    route: `${kind} ${pagePath(req.body.url) || '?'}`,
    stack: text(req.body.stack, 4000) || null,
    userId: req.userId
  });
  res.status(204).end();
});

// Day 75: Content-Security-Policy violations (frontend/vercel.json sends
// them here), so a policy that blocks part of the live app -- say an inline
// script whose hash went stale -- shows up in Admin > Errors instead of
// failing silently in people's browsers. Browsers post them in two formats:
// report-uri's { "csp-report": {...} } and the Reporting API's
// [{ type: 'csp-violation', body: {...} }]. Only what was blocked (its
// origin, or 'inline'/'eval'), by which directive, and the page path are
// kept. Browser extensions trip the policy all the time; they are skipped.
const cspBody = express.json({ type: ['application/csp-report', 'application/reports+json'], limit: '16kb' });
const EXTENSION = /^(chrome|moz|safari(-web)?|ms-browser)-extension:/;

function cspViolations(body) {
  if (body && typeof body === 'object' && body['csp-report'] && typeof body['csp-report'] === 'object') {
    const r = body['csp-report'];
    return [{ directive: r['effective-directive'] || r['violated-directive'], blocked: r['blocked-uri'], page: r['document-uri'], source: r['source-file'] }];
  }
  if (Array.isArray(body)) {
    return body.slice(0, 10)
      .filter((r) => r && r.type === 'csp-violation' && r.body && typeof r.body === 'object')
      .map((r) => ({ directive: r.body.effectiveDirective, blocked: r.body.blockedURL, page: r.body.documentURL, source: r.body.sourceFile }));
  }
  return [];
}

function blockedWhat(value) {
  const raw = text(value, 500);
  if (!raw || /^(inline|eval|wasm-eval|trusted-types-\w+)$/.test(raw)) return raw || 'inline';
  try {
    return new URL(raw).origin;
  } catch {
    return raw.split(/[?#]/)[0].slice(0, 100);
  }
}

router.post('/csp-reports', clientErrorLimiter, cspBody, (req, res) => {
  for (const v of cspViolations(req.body)) {
    if ([v.blocked, v.source].some((u) => typeof u === 'string' && EXTENSION.test(u))) continue;
    const directive = text(v.directive, 60).replace(/[^\w-]/g, '') || 'unknown';
    report(new Error(`CSP blocked ${blockedWhat(v.blocked)} (${directive})`), {
      source: 'client',
      route: `csp ${pagePath(text(v.page, 500)) || '?'}`
    });
  }
  res.status(204).end();
});

module.exports = router;
