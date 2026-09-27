// B7 Explore in headless Edge (throwaway stack: alice(1) follows bob(2);
// bob has post 1). Seeds hashtagged posts + engagement through the API.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
async function createPost(token, content) {
  const f = new FormData(); f.append('content', content);
  return (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: f })).json();
}
const like = (token, id) => fetch(`${API}/posts/${id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
const comment = (token, id) => fetch(`${API}/posts/${id}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'great' }) });

(async () => {
  const p1 = await createPost(bobToken, 'sunset photo #travel #sunset');
  const p2 = await createPost(bobToken, 'airport again #travel');
  await createPost(bobToken, 'quiet day #coffee');
  await like(aliceToken, p1.id);
  await comment(aliceToken, p1.id);
  await like(aliceToken, p2.id);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1');
    localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
  }, aliceToken);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  // Bell now opens Notifications.
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.waitForURL('http://localhost:5173/notifications');
  check('top-bar bell opens Notifications', true);

  // Search screen: trending chips before searching + Explore link.
  await page.goto('http://localhost:5173/search', { waitUntil: 'networkidle' });
  await page.locator('.trending-chip').first().waitFor();
  const chips = await page.locator('.trending-chip').allInnerTexts();
  check('Search shows trending chips, #travel first with 2 posts', /#travel\s*2 posts/.test(chips[0]), JSON.stringify(chips));
  // 4 tags: the seeded 'Hello from bob #welcome' post counts too. Ties (1 post) go newest-first.
  const tagNames = chips.map((c) => c.split(/\s+/)[0]);
  check('all four tags, ties newest-first', JSON.stringify(tagNames) === JSON.stringify(['#travel', '#coffee', '#sunset', '#welcome']), JSON.stringify(tagNames));
  await page.screenshot({ path: path.join(SP, 'b7-search-trending.png') });

  // Chip -> hashtag feed.
  await page.locator('.trending-chip').first().click();
  await page.waitForURL(/\/hashtag\/travel/);
  await page.getByText('sunset photo').first().waitFor();
  check('trending chip opens the hashtag feed', true);

  // Explore screen via link.
  await page.goto('http://localhost:5173/search', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Explore popular posts/ }).click();
  await page.waitForURL('http://localhost:5173/explore');
  await page.locator('.explore-posts article.post-card').first().waitFor();
  const cards = await page.locator('.explore-posts article.post-card').allInnerTexts();
  check('Explore lists only engaged posts, most popular first (comment weighs double)',
    cards.length === 2 && /sunset photo/.test(cards[0]) && /airport again/.test(cards[1]), `${cards.length} cards`);
  check('Explore shows trending chips too', (await page.locator('.trending-chip').count()) === 4);

  // Hashtag-less 375 dark: no overflow.
  const dark = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await dark.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1');
    localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', 'dark');
  }, aliceToken);
  const d = await dark.newPage();
  d.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await d.goto('http://localhost:5173/explore', { waitUntil: 'networkidle' });
  await d.locator('.explore-posts article.post-card').first().waitFor();
  check('375px dark: no horizontal scroll', !(await d.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await d.screenshot({ path: path.join(SP, 'b7-explore-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
