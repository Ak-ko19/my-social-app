// C1: log in as the seeded demo account through the real UI and check the demo world.
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const SP = __dirname;
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('thiri@demo.mysocialapp.test');
  await page.getByLabel('Password').fill('demo-password-123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(`${WEB}/`);
  await page.locator('article.post-card').first().waitFor();
  const cards = await page.locator('article.post-card').count();
  check('demo account logs in and sees a full feed', cards >= 5, `${cards} cards`);
  check('page post from followed page is in the feed', (await page.getByRole('link', { name: 'Mingalar Tea House' }).count()) >= 1);
  check('reactions and counts show', (await page.getByText(/\d+ reactions/).count()) >= 1);
  await page.screenshot({ path: path.join(SP, 'c1-home.png') });

  const bell = await page.getByRole('button', { name: /Notifications, 3 unread/ }).count();
  check('3 unread notifications', bell === 1);

  await page.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
  await page.getByText('Weekend Hikers 🥾').waitFor();
  check('inbox has DMs + group chat with an unread message', (await page.locator('.messages-unread-badge').count()) === 1);
  await page.screenshot({ path: path.join(SP, 'c1-inbox.png') });

  await page.goto(`${WEB}/groups`, { waitUntil: 'networkidle' });
  await page.getByText('Yangon Foodies').waitFor();
  check('groups listed', (await page.getByText('Myanmar Startup Founders').count()) === 1);

  await page.goto(`${WEB}/hashtag/yangon`, { waitUntil: 'networkidle' });
  await page.locator('article.post-card').first().waitFor();
  check('hashtag feed populated', (await page.locator('article.post-card').count()) >= 3);

  await page.goto(`${WEB}/admin?section=reports`, { waitUntil: 'networkidle' });
  await page.locator('.admin-report').first().waitFor();
  check('demo admin sees a pending report', true);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
