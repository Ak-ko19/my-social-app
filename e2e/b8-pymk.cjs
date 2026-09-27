// B8 People you may know in headless Edge (throwaway stack: alice(1)
// follows bob(2)).
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
const call = (method, url, token, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
});
async function signup(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'a-fine-password-123' }) });
  return (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'a-fine-password-123' }) })).json();
}

(async () => {
  const carol = await signup('carol');
  const dave = await signup('dave');
  const eve = await signup('eve');
  await call('POST', `/users/${carol.id}/follow`, bobToken); // bob -> carol (mutual via bob)
  await call('POST', '/users/1/follow', dave.token); // dave follows alice
  await call('POST', `/users/${eve.id}/follow`, bobToken); // bob -> eve (before eve goes private)
  await call('PUT', '/profile/privacy', eve.token, { isPrivate: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async ({ width = 390, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th);
    }, [aliceToken, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };

  const page = await newPage();
  await page.goto('http://localhost:5173/explore', { waitUntil: 'networkidle' });
  await page.locator('.pymk-card').first().waitFor();
  const cards = await page.locator('.pymk-card').evaluateAll((els) => els.map((e) => ({
    name: e.querySelector('.pymk-name').textContent, reason: e.querySelector('.pymk-reason').textContent
  })));
  const names = cards.map((c) => c.name);
  check('Explore shows People you may know; dave (follows you) ranks first', names[0] === 'dave' && cards[0].reason === 'Follows you', JSON.stringify(cards));
  check('carol + eve suggested via bob; bob (already followed) and alice absent',
    names.includes('carol') && names.includes('eve') && !names.includes('bob') && !names.includes('alice'));
  const carolCard = cards.find((c) => c.name === 'carol');
  check('reason reads "Followed by bob"', carolCard && carolCard.reason === 'Followed by bob', carolCard && carolCard.reason);

  // Follow carol (public) -> Following.
  const card = (name) => page.locator('.pymk-card', { has: page.locator('.pymk-name', { hasText: new RegExp(`^${name}$`) }) });
  await card('carol').getByRole('button', { name: 'Follow' }).click();
  await page.waitForTimeout(700);
  check('following carol shows "Following"', (await card('carol').getByRole('button').innerText()) === 'Following');
  const aliceFollowing = await (await call('GET', '/users/1/following', aliceToken)).json();
  check('server: alice now follows carol', aliceFollowing.some((u) => u.id === carol.id));

  // Follow eve (private) -> Requested (the useFollowToggle pending fix).
  await card('eve').getByRole('button', { name: 'Follow' }).click();
  await page.waitForTimeout(700);
  check('following private eve shows "Requested", not "Following"', (await card('eve').getByRole('button').innerText()) === 'Requested');
  const eveRequests = await (await call('GET', '/follow-requests', eve.token)).json();
  check('server: eve has a pending request from alice', eveRequests.some((u) => u.id === 1));

  // Profile link.
  await card('dave').locator('.pymk-profile-link').click();
  await page.waitForURL(`http://localhost:5173/profile/${dave.id}`);
  check('card opens the profile', true);

  // Search pre-query shows it too (after following carol/eve, only dave remains from the network).
  await page.goto('http://localhost:5173/search', { waitUntil: 'networkidle' });
  await page.locator('.pymk-card').first().waitFor();
  const searchNames = await page.locator('.pymk-name').allInnerTexts();
  check('Search shows suggestions too, minus the ones just followed/requested', searchNames.includes('dave') && !searchNames.includes('carol') && !searchNames.includes('eve'), JSON.stringify(searchNames));

  // 375 dark: row scrolls inside itself, page doesn't.
  const small = await newPage({ width: 375, theme: 'dark' });
  await small.goto('http://localhost:5173/explore', { waitUntil: 'networkidle' });
  await small.locator('.pymk-card').first().waitFor();
  check('375px dark: no page-level horizontal scroll', !(await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await small.screenshot({ path: path.join(SP, 'b8-pymk-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
