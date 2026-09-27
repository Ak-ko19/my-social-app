// B6 profile tabs in headless Edge (throwaway stack: alice(1) follows
// bob(2); bob has public post 1).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const PG = (process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin');
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
let expect403 = false;
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`"${PG}/psql.exe" -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const json = (method, url, token, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
}).then((r) => r.json().catch(() => null));
async function signup(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'a-fine-password-123' }) });
  return (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'a-fine-password-123' }) })).json();
}

(async () => {
  // Seed: a bob photo post (media via SQL), carol mentions @bob, alice bookmarks post 1, private dave.
  const img = 'http://localhost:5173/icon-512.png';
  const photoId = sql(`INSERT INTO posts (user_id, content, image_url) VALUES (2, 'bob photo post', '${img}') RETURNING id`).split('\n')[0];
  sql(`INSERT INTO post_media (post_id, url, position) VALUES (${photoId}, '${img}', 0), (${photoId}, 'http://localhost:5173/icon-192.png', 1)`);
  const carol = await signup('carol');
  const form = new FormData(); form.append('content', 'shoutout to @bob today');
  await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${carol.token}` }, body: form });
  await fetch(`${API}/posts/1/bookmark`, { method: 'POST', headers: { Authorization: `Bearer ${aliceToken}` } });
  const dave = await signup('dave');
  const f2 = new FormData(); f2.append('content', 'dave private post');
  await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${dave.token}` }, body: f2 });
  await json('PUT', '/profile/privacy', dave.token, { isPrivate: true });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async ({ width = 390, theme = 'light' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th);
    }, [aliceToken, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (expect403 && /403/.test(m.text())) return;
      errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };
  const tabNames = (page) => page.getByRole('tab').allInnerTexts();
  const panel = (page) => page.getByRole('tabpanel');

  const page = await newPage();
  // Bob's profile as alice.
  await page.goto('http://localhost:5173/profile/2', { waitUntil: 'networkidle' });
  check('other profile: Posts / Photos / Tagged (no Saved)', JSON.stringify(await tabNames(page)) === JSON.stringify(['Posts', 'Photos', 'Tagged']), JSON.stringify(await tabNames(page)));
  await page.waitForSelector('.profile-tab-posts .post-card');
  const postsText = await panel(page).innerText();
  check('Posts tab lists bob\'s posts', /bob photo post/.test(postsText) && /Hello from bob/.test(postsText));

  await page.getByRole('tab', { name: 'Posts' }).focus();
  await page.keyboard.press('ArrowRight');
  check('ArrowRight selects Photos', (await page.getByRole('tab', { name: 'Photos' }).getAttribute('aria-selected')) === 'true');
  await page.waitForSelector('.profile-photos-grid li');
  check('Photos tab: 1 photo post, multi-image badge shows 2', (await page.locator('.profile-photos-grid li').count()) === 1 && (await page.locator('.profile-photo-multi').innerText()) === '2');
  await page.keyboard.press('End');
  check('End selects Tagged', (await page.getByRole('tab', { name: 'Tagged' }).getAttribute('aria-selected')) === 'true');
  await page.waitForSelector('.profile-tab-posts .post-card');
  const taggedText = await panel(page).innerText();
  check('Tagged tab: carol\'s post mentioning @bob (and not bob\'s own)', /shoutout to @bob/.test(taggedText) && !/bob photo post/.test(taggedText));

  // Photo grid -> post detail.
  await page.getByRole('tab', { name: 'Photos' }).click();
  await page.locator('.profile-photo-link').first().click();
  await page.waitForURL(/\/posts\/\d+/);
  await page.getByText('bob photo post').first().waitFor();
  check('tapping a photo opens its post', /bob photo post/.test(await page.locator('body').innerText()));

  // Own profile via Settings row.
  await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' });
  await page.locator('.profile-summary-row, a[href="/profile/1"]').first().click();
  await page.waitForURL('http://localhost:5173/profile/1');
  await page.getByRole('tab', { name: 'Saved' }).waitFor();
  check('Settings profile row opens your own profile', true);
  check('own profile adds Saved', JSON.stringify(await tabNames(page)) === JSON.stringify(['Posts', 'Photos', 'Saved', 'Tagged']));
  await page.getByRole('tab', { name: 'Saved' }).click();
  await page.waitForSelector('.profile-tab-posts .post-card');
  check('Saved tab shows the bookmarked post', /Hello from bob/.test(await panel(page).innerText()));
  await page.getByRole('tab', { name: 'Posts' }).click();
  await page.waitForTimeout(600);
  check('own Posts tab empty state', /No posts yet/.test(await panel(page).innerText()));

  // Private dave.
  expect403 = true;
  await page.goto(`http://localhost:5173/profile/${dave.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  expect403 = false;
  check('private account: explains instead of erroring', /This account is private\. Follow dave/.test(await panel(page).innerText()));

  // 375 dark layout.
  const small = await newPage({ width: 375, theme: 'dark' });
  await small.goto('http://localhost:5173/profile/2', { waitUntil: 'networkidle' });
  await small.getByRole('tab', { name: 'Photos' }).click();
  await small.waitForSelector('.profile-photos-grid li');
  const hScroll = await small.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('375px dark: no horizontal scroll', !hScroll);
  await small.screenshot({ path: path.join(SP, 'b6-tabs-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
