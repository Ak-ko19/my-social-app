// Day 19: links in posts and messages are clickable, and the first one
// gets a preview card (site, title, description -- never the site's image).
// Pages come from link-stub.cjs (127.0.0.1:3902), which the backend may
// fetch only because e2e-up.sh names it as the test origin.
// Throwaway stack: alice(1), bob(2), conversation 1 between them.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const STUB = 'http://127.0.0.1:3902';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const post = (token, content) => {
  const form = new FormData();
  form.append('content', content);
  return fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).then((r) => r.json());
};
const send = (token, text) => fetch(`${API}/conversations/1/messages`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text })
});

(async () => {
  await post(bobToken, `Weekend plans? Read ${STUB}/article.`);
  await post(bobToken, `This page has nothing to preview: ${STUB}/plain`);
  await post(bobToken, `Broken link ${STUB}/missing and a hashtag #news`);
  await send(bobToken, `ဒီသတင်းကြည့်ပါ ${STUB}/myanmar`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const externalRequests = [];
  async function newPage(token, id, name, { lang = 'en', theme = 'light', width = 390 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, i, n, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', i); localStorage.setItem('username', n);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [token, String(id), name, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}/${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${name}/${lang}: ${e.message}`));
    // The reader's browser must never contact the linked site itself.
    page.on('request', (r) => { if (r.url().startsWith(STUB) || r.url().includes('example.com')) externalRequests.push(r.url()); });
    return page;
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

  // 1. Feed: the article link gets a card; the link itself is clickable.
  const feed = await newPage(aliceToken, 1, 'alice', { width: 375 });
  await feed.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const card = feed.locator('a.post-card-link-preview', { hasText: 'Rain expected across the region' });
  await card.waitFor({ timeout: 10000 }).catch(() => {});
  check('feed: the article gets a preview card with its title', (await card.count()) === 1);
  check('...with the site name and description', /Daily Example/i.test(await card.innerText().catch(() => '')) && /heavy rain will reach the coast/.test(await card.innerText().catch(() => '')));
  check('...and no image (the reader never loads anything from the site)', (await card.locator('img').count()) === 0);
  check('...opens the page safely in a new tab', (await card.getAttribute('href')) === `${STUB}/article`
    && (await card.getAttribute('target')) === '_blank' && (await card.getAttribute('rel')) === 'noopener noreferrer nofollow ugc');
  const textLink = feed.locator('.post-card-body a.post-text-link', { hasText: `${STUB}/article` });
  check('the URL in the text is a link, without the sentence\'s full stop', (await textLink.count()) === 1 && (await textLink.getAttribute('href')) === `${STUB}/article`);
  check('pages with nothing to show, and dead links: no card', (await feed.locator('a.post-card-link-preview').count()) === 1);
  check('...but their URLs are still links, and #news is still a hashtag',
    (await feed.locator(`a.post-text-link[href="${STUB}/plain"]`).count()) === 1 && (await feed.locator('a.post-text-hashtag[href="/hashtag/news"]').count()) === 1);
  check('feed: no horizontal scroll at 375px', await noHScroll(feed));
  await feed.screenshot({ path: path.join(SP, 'day19-feed-en.png') });
  await feed.context().close();

  // 2. A message with a link: clickable, with a card in the bubble (Myanmar title).
  const chat = await newPage(aliceToken, 1, 'alice', { lang: 'my', theme: 'dark' });
  await chat.goto(`${WEB}/messages/1`, { waitUntil: 'networkidle' });
  const bubbleCard = chat.locator('.messages-bubble a.post-card-link-preview');
  await bubbleCard.waitFor({ timeout: 10000 }).catch(() => {});
  check('message: preview card inside the bubble, Myanmar title intact', /မြန်မာ သတင်း ခေါင်းစဉ်/.test(await bubbleCard.innerText().catch(() => '')));
  check('message: the URL is a link', (await chat.locator(`.messages-bubble a.post-text-link[href="${STUB}/myanmar"]`).count()) === 1);
  check('message: no horizontal scroll', await noHScroll(chat));
  await chat.screenshot({ path: path.join(SP, 'day19-chat-my-dark.png') });
  await chat.context().close();

  // 3. Arabic, right-to-left, 430px: the card and the URL read correctly.
  const ar = await newPage(aliceToken, 1, 'alice', { lang: 'ar', theme: 'dark', width: 430 });
  await ar.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await ar.locator('a.post-card-link-preview').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('ar: card shown', (await ar.locator('a.post-card-link-preview').count()) === 1);
  check('ar: URLs keep left-to-right order', await ar.locator('a.post-text-link bdi').first().getAttribute('dir') === 'ltr');
  check('ar: no horizontal scroll', await noHScroll(ar));
  await ar.screenshot({ path: path.join(SP, 'day19-feed-ar-dark.png') });
  await ar.context().close();

  check('readers\' browsers never contacted the linked site', externalRequests.length === 0, externalRequests.join(' '));

  // 4. The API itself refuses to fetch internal addresses.
  const internal = await fetch(`${API}/link-preview?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`, { headers: { Authorization: `Bearer ${aliceToken}` } });
  check('API: an internal address gets no preview (204)', internal.status === 204);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
