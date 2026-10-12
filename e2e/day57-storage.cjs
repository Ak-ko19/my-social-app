// Day 57: storage safety (headless Edge, throwaway stack: alice(1)).
// Step 1: a big photo picked in the composer is shrunk in the browser
// before it's sent -- at most 2048 px, WebP, far fewer bytes. Step 2: over
// the daily upload limit, the composer says why.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim() };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
    localStorage.setItem('emailVerified', 'true');
  }, tokens.alice);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // The refused upload (step 2) answers 429 -- expected there only.
  let expect429 = false;
  page.on('console', (m) => { if (m.type() === 'error' && !(expect429 && /status of 429|status code 429|AxiosError/.test(m.text()))) errors.push(m.text()); });
  await page.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });

  // A 3000 x 3000 PNG full of noise: several MB, like a phone photo.
  const big = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 3000;
    c.height = 3000;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(3000, 3000);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 7) % 255; img.data[i + 1] = (i * 13) % 255; img.data[i + 2] = (i * 31) % 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }), 'base64');

  let sent = null;
  await page.route('**/posts', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    sent = req.postDataBuffer();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 999, media: [] }) });
  });
  await page.locator('textarea').fill('big photo');
  await page.locator('input[type=file]').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: big });
  await page.locator('.image-picker-item').first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.getByRole('button', { name: /^post$/i }).click();
  for (let i = 0; i < 50 && !sent; i += 1) await page.waitForTimeout(200);
  const head = sent ? sent.toString('latin1') : '';
  const type = (head.match(/name="images"; filename="([^"]+)"\r\nContent-Type: ([^\r\n]+)/) || []).slice(1);
  check('the picked photo goes up as WebP, renamed', type[0] === 'huge.webp' && type[1] === 'image/webp', JSON.stringify(type));
  check('...and far smaller than it was', sent && sent.length < big.length / 3, `${big.length} -> ${sent && sent.length} bytes`);

  // Step 2: over today's upload limit, the composer says so and keeps the
  // post (nothing is sent to Cloudinary).
  sql("INSERT INTO media_uploads (user_id, kind, bytes) SELECT 1, 'image', 1000 FROM generate_series(1, 100)");
  await page.unroute('**/posts');
  expect429 = true;
  await page.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
  await page.locator('textarea').fill('one more photo');
  await page.locator('input[type=file]').setInputFiles(path.join(SP, '..', 'frontend', 'public', 'icon-192.png'));
  await page.locator('.image-picker-item').first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.getByRole('button', { name: /^post$/i }).click();
  const limitMsg = page.getByText("You've reached today's upload limit. Please try again tomorrow.");
  await limitMsg.waitFor({ timeout: 8000 }).catch(() => {});
  check("over today's upload limit: the composer says so and keeps the post", (await limitMsg.count()) === 1
    && (await page.locator('textarea').inputValue()) === 'one more photo' && sql("SELECT COUNT(*) FROM posts WHERE content = 'one more photo'") === '0');

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
