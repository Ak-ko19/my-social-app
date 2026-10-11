// B11 notification settings in headless Edge (throwaway stack: alice(1), bob(2)).
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
const get = (url, token) => fetch(API + url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());

(async () => {
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

  await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Notification Settings/ }).click();
  await page.waitForURL('http://localhost:5173/settings/notifications');
  // Wait for a switch unique to this screen (Settings has its own switches).
  await page.getByRole('switch', { name: 'Accepted requests' }).waitFor();
  const switches = page.getByRole('switch');
  const states = await switches.evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked')));
  check('7 switches (Day 23 added Messages, Day 50 Groups), all on by default', states.length === 7 && states.every((s) => s === 'true'), JSON.stringify(states));

  const likes = page.getByRole('switch', { name: 'Likes and reactions' });
  await likes.click();
  await page.waitForTimeout(600);
  check('click turns "Likes and reactions" off', (await likes.getAttribute('aria-checked')) === 'false');
  check('server saved likes=false', (await get('/notification-preferences', aliceToken)).likes === false);

  // End to end: bob likes + comments on alice's post -> only the comment notifies.
  const f = new FormData(); f.append('content', 'alice post');
  const post = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${aliceToken}` }, body: f })).json();
  await fetch(`${API}/posts/${post.id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}` } });
  await fetch(`${API}/posts/${post.id}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'cool' }) });
  const types = (await get('/notifications', aliceToken)).notifications.map((n) => n.type);
  check('with likes off: bob\'s like did not notify, his comment did', !types.includes('like') && types.includes('comment'), JSON.stringify(types));

  await page.reload({ waitUntil: 'networkidle' });
  await likes.waitFor();
  check('setting persists across reload', (await likes.getAttribute('aria-checked')) === 'false');

  // Keyboard: Space on the focused switch.
  const mentions = page.getByRole('switch', { name: 'Mentions' });
  await mentions.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  check('Space toggles the focused switch (Mentions off)', (await mentions.getAttribute('aria-checked')) === 'false' && (await get('/notification-preferences', aliceToken)).mentions === false);
  const desc = await mentions.getAttribute('aria-describedby');
  check('switch has an accessible description', Boolean(desc) && (await page.locator(`#${desc}`).innerText()).includes('@mentions'));

  // Turn likes back on.
  await likes.click();
  await page.waitForTimeout(600);
  check('turning likes back on saves', (await get('/notification-preferences', aliceToken)).likes === true);

  const small = await newPage({ width: 375, theme: 'dark' });
  await small.goto('http://localhost:5173/settings/notifications', { waitUntil: 'networkidle' });
  await small.getByRole('switch').first().waitFor();
  check('375px dark: no horizontal scroll', !(await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await small.screenshot({ path: path.join(SP, 'b11-settings-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
