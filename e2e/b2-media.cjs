// B2 multi-image posts in headless Edge, against the throwaway stack.
// Seeds (via psql into the e2e DB) one 3-image post and one 1-image post by
// bob, using images the vite dev server already serves from /public.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const PG = (process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin');
const token = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const IMG = ['icon-512.png', 'icon-192.png', 'apple-touch-icon.png'].map((f) => `http://localhost:5173/${f}`);
const PUBLIC_DIR = require('path').resolve(__dirname, '../frontend/public');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

function sql(q) {
  return execSync(`"${PG}/psql.exe" -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
}

(async () => {
  const multiId = sql(`INSERT INTO posts (user_id, content, image_url) VALUES (2, 'three pics', '${IMG[0]}') RETURNING id`).split('\n')[0];
  sql(`INSERT INTO post_media (post_id, url, position) VALUES (${multiId}, '${IMG[0]}', 0), (${multiId}, '${IMG[1]}', 1), (${multiId}, '${IMG[2]}', 2)`);
  const singleId = sql(`INSERT INTO posts (user_id, content, image_url) VALUES (2, 'one pic', '${IMG[1]}') RETURNING id`).split('\n')[0];
  sql(`INSERT INTO post_media (post_id, url, position) VALUES (${singleId}, '${IMG[1]}', 0)`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage({ width = 390, touch = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript((t) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
    }, token);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  }

  // 1-3. Desktop: carousel on the detail page of the 3-image post.
  let page = await newPage();
  await page.goto(`http://localhost:5173/posts/${multiId}`, { waitUntil: 'networkidle' });
  const carousel = page.locator('.media-carousel');
  const counter = () => page.locator('.media-carousel-counter').innerText();
  check('3-image post renders a carousel with 3 slides', (await carousel.count()) === 1 && (await page.locator('.media-carousel-slide').count()) === 3);
  check('counter starts at 1/3; no Previous on first slide', (await counter()) === '1/3' && (await page.getByRole('button', { name: 'Previous image' }).count()) === 0);
  await page.getByRole('button', { name: 'Next image' }).click();
  await page.waitForTimeout(700);
  check('Next button -> 2/3', (await counter()) === '2/3');
  await page.locator('.media-carousel-track').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  check('ArrowRight on focused track -> 3/3, Next hidden at end', (await counter()) === '3/3' && (await page.getByRole('button', { name: 'Next image' }).count()) === 0);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(700);
  check('ArrowLeft -> 2/3', (await counter()) === '2/3');
  await page.screenshot({ path: path.join(SP, 'b2-carousel-desktop.png') });

  // 4. Single-image post: plain image, no carousel chrome.
  await page.goto(`http://localhost:5173/posts/${singleId}`, { waitUntil: 'networkidle' });
  check('1-image post has no carousel', (await page.locator('.media-carousel').count()) === 0 && (await page.locator('.post-card-media').count()) === 1);
  await page.context().close();

  // 5. Touch at 375px: swipe (scroll) updates the counter; no arrow buttons; no page h-scroll.
  page = await newPage({ width: 375, touch: true });
  await page.goto(`http://localhost:5173/posts/${multiId}`, { waitUntil: 'networkidle' });
  await page.locator('.media-carousel-track').evaluate((el) => el.scrollTo({ left: el.clientWidth * 2 }));
  await page.waitForTimeout(500);
  check('touch: swipe to last slide -> 3/3', (await counter()) === '3/3');
  const navVisible = await page.locator('.media-carousel-nav').evaluateAll((els) => els.some((e) => getComputedStyle(e).display !== 'none'));
  check('touch: arrow buttons hidden (hover: none)', !navVisible);
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('no horizontal page scroll at 375px', !hScroll);
  await page.screenshot({ path: path.join(SP, 'b2-carousel-touch-375.png') });
  await page.context().close();

  // 6-8. CreatePost multi-select: add 3, remove 1, submit sends exactly 2 'images' parts.
  page = await newPage();
  let captured = null;
  await page.route('**/posts', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    captured = req.postDataBuffer().toString('latin1');
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 999, media: [] }) });
  });
  await page.goto('http://localhost:5173/create-post', { waitUntil: 'networkidle' });
  await page.locator('textarea').fill('multi upload test');
  const files = ['icon-512.png', 'icon-192.png', 'apple-touch-icon.png'].map((f) => path.join(PUBLIC_DIR, f));
  await page.locator('input[type=file]').setInputFiles(files);
  check('3 thumbnails after picking 3', (await page.locator('.image-picker-item').count()) === 3);
  await page.getByRole('button', { name: 'Remove image 2' }).click();
  check('remove -> 2 thumbnails', (await page.locator('.image-picker-item').count()) === 2);
  await page.getByRole('button', { name: /^post$/i }).click();
  await page.waitForURL('http://localhost:5173/');
  const imagesParts = captured ? (captured.match(/name="images"/g) || []).length : -1;
  check('submit sends 2 "images" parts, none of the legacy "image"', imagesParts === 2 && !/name="image"/.test(captured), `parts=${imagesParts}`);

  // 9. Cap at 10: picking 11 keeps 10 and shows the limit message.
  await page.goto('http://localhost:5173/create-post', { waitUntil: 'networkidle' });
  const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: fs.readFileSync(files[1]) }));
  await page.locator('input[type=file]').setInputFiles(eleven);
  const thumbs = await page.locator('.image-picker-item').count();
  const alert = await page.locator('[role=alert]').allInnerTexts();
  check('picking 11 keeps 10 and explains why', thumbs === 10 && alert.some((t) => /up to 10/.test(t)), `thumbs=${thumbs}`);
  check('file input disabled at the cap', await page.locator('input[type=file]').isDisabled());

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
