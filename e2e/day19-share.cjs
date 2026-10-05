// Day 19 step 2: share cards. On the production build served with the real
// vercel.json (serve-dist.cjs), link-preview crawlers asking for
// /posts/:id get the post's Open Graph card from the API; people get the
// app as usual. Runs in DIST_SUITES. Throwaway stack: alice(1), bob(2).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const newPost = (content, visibility) => {
  const form = new FormData();
  form.append('content', content);
  if (visibility) form.append('visibility', visibility);
  return fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}` }, body: form }).then((r) => r.json());
};
const tag = (html, key) => {
  const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html);
  return m ? m[1] : null;
};
const crawl = (urlPath, ua) => fetch(WEB + urlPath, { headers: { 'User-Agent': ua } }).then((r) => r.text());
const asCrawler = (id, ua) => crawl(`/posts/${id}`, ua);

(async () => {
  const pub = await newPost('Morning market in Yangon — fresh mangoes everywhere');
  const friends = await newPost('Only my followers should see this', 'followers');

  // 1. Crawlers get the card (several of the common ones).
  for (const ua of [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'TelegramBot (like TwitterBot)',
    'WhatsApp/2.23.20.0 A',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Viber/20.0'
  ]) {
    const html = await asCrawler(pub.id, ua);
    const name = ua.split(/[ /(]/)[0];
    check(`${name}: card with the author and the text`, tag(html, 'og:title') === 'bob on MySocialApp'
      && tag(html, 'og:description') === 'Morning market in Yangon — fresh mangoes everywhere', tag(html, 'og:title') || html.slice(0, 80));
    check(`${name}: points back at the post in the app`, tag(html, 'og:url') === `${WEB}/posts/${pub.id}`);
  }

  // 2. Nothing private leaks to a crawler.
  const hidden = await asCrawler(friends.id, 'facebookexternalhit/1.1');
  check('followers-only post: generic card, text not included', tag(hidden, 'og:title') === 'MySocialApp' && !hidden.includes('Only my followers'));
  const missing = await asCrawler(999999, 'facebookexternalhit/1.1');
  check('missing post: the same generic card', tag(missing, 'og:title') === 'MySocialApp');

  // 2b. Day 24: profiles (by id or username) and pages get cards too; a
  // private account doesn't.
  execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "UPDATE users SET bio = 'Tea lover in Yangon' WHERE id = 2"`);
  for (const id of ['2', 'bob']) {
    const html = await crawl(`/profile/${id}`, 'facebookexternalhit/1.1');
    check(`profile /profile/${id}: card with name and bio`, tag(html, 'og:title') === 'bob on MySocialApp' && tag(html, 'og:description') === 'Tea lover in Yangon', tag(html, 'og:title'));
  }
  const cafe = await fetch(`${API}/pages`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Mohinga Corner', description: 'Breakfast since 1998' }) }).then((r) => r.json());
  const pageHtml = await crawl(`/pages/${cafe.id}`, 'TelegramBot (like TwitterBot)');
  check('page: card with its name and description', tag(pageHtml, 'og:title') === 'Mohinga Corner on MySocialApp' && tag(pageHtml, 'og:description') === 'Breakfast since 1998');
  execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "UPDATE users SET is_private = true WHERE id = 2"`);
  const privateHtml = await crawl('/profile/bob', 'facebookexternalhit/1.1');
  check('a private account: generic card, bio not included', tag(privateHtml, 'og:title') === 'MySocialApp' && !privateHtml.includes('Tea lover'));
  execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -c "UPDATE users SET is_private = false WHERE id = 2"`);

  // 3. A person (a normal browser) gets the app, not the card page.
  const plain = await fetch(`${WEB}/posts/${pub.id}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' } }).then((r) => r.text());
  check('a browser user-agent gets the app (index.html), not the card', plain.includes('<div id="root">') && tag(plain, 'og:title') === null);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
    localStorage.setItem('emailVerified', 'true');
  }, aliceToken);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${WEB}/posts/${pub.id}`, { waitUntil: 'networkidle' });
  await page.getByText('Morning market in Yangon').first().waitFor({ timeout: 8000 }).catch(() => {});
  check('in the browser, the shared link opens the post in the app', (await page.getByText('Morning market in Yangon').count()) >= 1 && page.url() === `${WEB}/posts/${pub.id}`);

  // Day 24: fonts are self-hosted -- they load from this site (under the
  // strict CSP of this production build), and nothing goes to Google.
  const fontCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fontCtx.addInitScript(() => localStorage.setItem('lang', 'my'));
  const fontPage = await fontCtx.newPage();
  const external = [];
  fontPage.on('request', (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url()); });
  fontPage.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await fontPage.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  const fonts = await fontPage.evaluate(async () => {
    await document.fonts.ready;
    return {
      manrope: document.fonts.check('700 16px Manrope'),
      myanmar: document.fonts.check('400 16px "Noto Sans Myanmar"', 'မြန်မာ'),
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''))
    };
  });
  check('fonts: Manrope and Noto Sans Myanmar load from this site', fonts.manrope && fonts.myanmar && fonts.loaded.includes('Noto Sans Myanmar'), JSON.stringify(fonts));
  check('fonts: no request to Google Fonts', external.length === 0, external.join(' '));
  await fontCtx.close();
  await browser.close();

  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
