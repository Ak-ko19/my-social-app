const express = require('express');
const path = require('path');
const { build } = require('../docs/openapi');

const router = express.Router();

// Day 68: the API reference for developers -- GET /openapi.json (the
// OpenAPI 3.1 spec, docs/openapi) and GET /docs (Swagger UI, served from
// the swagger-ui-dist package, no CDN). On outside production; in
// production only with API_DOCS=1 -- this is the app's own API, and there is
// no need to publish its map by default (every route is protected on its
// own either way).
const enabled = () => process.env.NODE_ENV !== 'production' || process.env.API_DOCS === '1';

let spec = null; // built once; it only changes with the code

router.get('/openapi.json', (req, res, next) => {
  if (!enabled()) return next();
  spec = spec || build();
  res.set('Cache-Control', 'no-cache');
  res.json(spec);
});

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MySocialApp API</title>
    <link rel="icon" href="data:,">
    <link rel="stylesheet" href="/docs/assets/swagger-ui.css">
  </head>
  <body>
    <div id="docs"></div>
    <script src="/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/docs/init.js"></script>
  </body>
</html>
`;

router.get('/docs', (req, res, next) => {
  if (!enabled()) return next();
  res.type('html').send(PAGE);
});

// The page's own script is a file, not inline: the API's CSP (helmet's
// default) allows scripts from 'self' only. (Its files are middleware, not
// routes, so they aren't API operations in the spec.)
router.use('/docs/init.js', (req, res, next) => {
  if (!enabled() || req.method !== 'GET' || req.path !== '/') return next();
  res.sendFile(path.join(__dirname, '../docs/swagger-init.js'));
});

// Only the two files the page uses, not the package's demo page.
const ASSETS = path.dirname(require.resolve('swagger-ui-dist/package.json'));
const assets = express.static(ASSETS, { index: false, maxAge: '1d' });
router.use('/docs/assets', (req, res, next) => {
  if (!enabled() || !['/swagger-ui.css', '/swagger-ui-bundle.js'].includes(req.path)) return next();
  assets(req, res, next);
});

module.exports = router;
