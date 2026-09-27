// B3 Stories in headless Edge against the throwaway stack (e2e-up.sh:
// alice(1) follows bob(2)). Seeds stories via psql with images served by
// the vite dev server.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const PG = (process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin');
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const IMG = ['icon-512.png', 'icon-192.png', 'apple-touch-icon.png'].map((f) => `http://localhost:5173/${f}`);
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`"${PG}/psql.exe" -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const api = (method, url, token, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

async function signup(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'a-fine-password-123' }) });
  const r = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'a-fine-password-123' }) });
  return (await r.json());
}

(async () => {
  const carol = await signup('carol');
  const dave = await signup('dave');
  await api('POST', `/users/${carol.id}/follow`, aliceToken);
  // Oldest first: alice's own, bob x2, dave (not followed), carol (newest).
  sql(`INSERT INTO stories (user_id, media_url, created_at) VALUES (1, '${IMG[2]}', now() - interval '50 min')`);
  sql(`INSERT INTO stories (user_id, media_url, created_at) VALUES (2, '${IMG[0]}', now() - interval '40 min'), (2, '${IMG[1]}', now() - interval '30 min')`);
  sql(`INSERT INTO stories (user_id, media_url, created_at) VALUES (${dave.id}, '${IMG[0]}', now() - interval '20 min')`);
  sql(`INSERT INTO stories (user_id, media_url, created_at) VALUES (${carol.id}, '${IMG[1]}', now() - interval '10 min')`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((t) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1');
    localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
  }, aliceToken);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  const labels = await page.locator('.stories-row .stories-avatar-btn').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check('tray: own first, then carol (newest unseen), then bob; dave (not followed) absent',
    JSON.stringify(labels) === JSON.stringify(['View your story', "View carol's story (new)", "View bob's story (new)"]), JSON.stringify(labels));

  // Open bob's stories.
  const bobBtn = page.getByRole('button', { name: /View bob's story/ });
  await bobBtn.click();
  const viewer = page.getByRole('dialog', { name: "bob's story" });
  await viewer.waitFor();
  check('viewer opens on bob with 2 progress segments', (await page.locator('.story-viewer-segment').count()) === 2);
  check('focus moves into the viewer (close button)', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Close stories'));
  const alt = () => page.locator('.story-viewer-image').getAttribute('alt');
  check('starts at story 1 of 2', /Story 1 of 2/.test(await alt()));
  await page.waitForTimeout(5800);
  check('auto-advances to story 2 after ~5s', /Story 2 of 2/.test(await alt()), await alt());

  // Tap zone: left third goes back.
  await page.getByRole('button', { name: 'Previous story' }).click();
  check('left tap zone -> previous story', /Story 1 of 2/.test(await alt()));

  // Keyboard: Right, Right -> past bob's last story; bob is the last group -> closes.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('ArrowRight past the last story closes the viewer', (await page.getByRole('dialog').count()) === 0);
  check('focus returns to bob\'s tray button', await page.evaluate(() => /View bob's story/.test(document.activeElement?.getAttribute('aria-label') || '')));
  check('bob now shows as seen (no "new")', (await page.getByRole('button', { name: "View bob's story" }).count()) === 1);

  const serverTray = (await api('GET', '/stories', aliceToken)).body;
  const bobGroup = serverTray.find((g) => g.user_id === 2);
  check('server recorded both views (bob all_seen)', bobGroup && bobGroup.all_seen === true);

  // Escape closes.
  await page.getByRole('button', { name: /View carol's story/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  check('Escape closes the viewer', (await page.getByRole('dialog').count()) === 0);

  // Own story: delete via confirm dialog.
  await page.getByRole('button', { name: 'View your story' }).click();
  await page.getByRole('dialog', { name: "alice's story" }).waitFor();
  await page.getByRole('button', { name: 'Delete this story' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(600);
  check('deleting own story closes the viewer', (await page.locator('.story-viewer').count()) === 0);
  check('"Your story" becomes "Add to your story"', (await page.locator('.stories-avatar-btn').first().getAttribute('aria-label')) === 'Add to your story');
  check('server: own story gone', !(await api('GET', '/stories', aliceToken)).body.some((g) => g.is_own));

  // Add a story: intercept the upload (Cloudinary isn't configured on the
  // throwaway backend); verify the multipart and that the tray reloads.
  let uploadBody = null;
  let trayRefetched = false;
  await page.route('**/stories', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      uploadBody = req.postDataBuffer().toString('latin1');
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":999}' });
    }
    trayRefetched = true;
    return route.continue();
  });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Add to your story' }).first().click()
  ]);
  await chooser.setFiles(path.join(require('path').resolve(__dirname, '../frontend/public'), 'icon-192.png'));
  await page.waitForTimeout(800);
  check('add story uploads one "image" part and reloads the tray', uploadBody && /name="image"/.test(uploadBody) && trayRefetched);

  // 375px: viewer fills the screen, no overflow.
  await page.unroute('**/stories');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: /View carol's story/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(400);
  const box = await page.locator('.story-viewer-frame').boundingBox();
  check('viewer fills a 375px screen', Math.round(box.width) === 375 && box.x === 0, `w=${Math.round(box.width)}`);
  await page.screenshot({ path: path.join(SP, 'b3-viewer-375.png') });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(SP, 'b3-tray-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
