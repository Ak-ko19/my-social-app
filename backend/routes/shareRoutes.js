const express = require('express');
const db = require('../db');
const { getVisiblePost } = require('../services/postVisibilityService');
const { sendServerError } = require('../utils/sendError');

const router = express.Router();

// Day 19: Open Graph "share cards". Link-preview crawlers (Facebook,
// Telegram, Viber, WhatsApp, X, ...) don't run JavaScript, so the app's
// /posts/:id page looks the same for every post to them. frontend/
// vercel.json sends those crawlers -- and only them, by user-agent -- to
// this page instead: plain HTML with the post's card tags, and a redirect
// to the app for anyone else who lands here.
//
// Only a post anyone may see (public, author not private, not in a private
// community, not deactivated/banned) gets a real card. Everything else gets
// the same generic card as a post that doesn't exist, so a shared link never
// reveals what's behind it.

const SITE = 'MySocialApp';
const EXCERPT = 200;

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function excerpt(text) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1).trimEnd()}…` : flat;
}

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

function page({ appUrl, title, description, image }) {
  const tags = [
    ['og:site_name', SITE],
    ['og:type', image || description ? 'article' : 'website'],
    ['og:url', appUrl],
    ['og:title', title],
    description && ['og:description', description],
    image && ['og:image', image],
    ['twitter:card', image ? 'summary_large_image' : 'summary'],
    ['twitter:title', title],
    description && ['twitter:description', description],
    image && ['twitter:image', image]
  ].filter(Boolean);
  const meta = tags
    .map(([key, value]) => {
      const attr = key.startsWith('twitter:') ? 'name' : 'property';
      return `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
    })
    .join('\n    ');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
    ${meta}
    <link rel="canonical" href="${escapeHtml(appUrl)}">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}">
  </head>
  <body>
    <p><a href="${escapeHtml(appUrl)}">${escapeHtml(title)}</a></p>
  </body>
</html>
`;
}

router.get('/share/posts/:id', async (req, res) => {
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const id = Number(req.params.id);
  try {
    let card = null;
    if (Number.isInteger(id) && id > 0 && (await getVisiblePost(id, null))) {
      const result = await db.query(
        `SELECT p.content, p.image_url, u.username, pg.name AS page_name,
           (SELECT pm.url FROM post_media pm WHERE pm.post_id = p.id ORDER BY pm.position LIMIT 1) AS first_media
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN pages pg ON pg.id = p.page_id
         WHERE p.id = $1`,
        [id]
      );
      const post = result.rows[0];
      if (post) {
        const image = [post.first_media, post.image_url].find(isHttpUrl) || null;
        card = {
          title: `${post.page_name || post.username} on ${SITE}`,
          description: excerpt(post.content) || null,
          image
        };
      }
    }
    const appUrl = Number.isInteger(id) && id > 0 ? `${frontend}/posts/${id}` : `${frontend}/`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(page({ appUrl, ...(card || { title: SITE, description: null, image: null }) }));
  } catch (err) {
    sendServerError(res, err, 'Loading the share card failed.');
  }
});

module.exports = router;
