// Day 57: storage safety (headless Edge, throwaway stack: alice(1)).
// Step 1: a big photo picked in the composer is shrunk in the browser
// before it's sent -- at most 2048 px, WebP, far fewer bytes.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
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

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
