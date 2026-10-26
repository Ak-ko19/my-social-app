// Day 96: editing a post's photos. Nina's post has two photos (really
// uploaded, through e2e/cloudinary-stub.cjs). From the post's menu, "Edit
// post" opens the composer ("Edit post") with her text and photos; she
// moves photo 2 first, removes the other, adds a new one, describes it and
// changes the text. Save: the post page shows the new photos in order with
// her words, and the API agrees (that the removed file leaves storage after
// the commit is backend postPhotos.test: the stub's files aren't on
// res.cloudinary.com, which the cleanup alone deletes). axe on the composer.
// EN/light 390 px and AR/dark 375 px (RTL). MEDIA_SUITES (E2E_MEDIA=1).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const EN = require('../frontend/src/i18n/locales/en.json');
const AR = require('../frontend/src/i18n/locales/ar.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PASSWORD = 'a-fine-password-123';
const PHOTO = path.join(__dirname, '../frontend/public/icon-512.png');
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const shows = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
async function photoPost(user, content, n) {
  const form = new FormData();
  form.append('content', content);
  const bytes = fs.readFileSync(PHOTO);
  for (let i = 0; i < n; i++) form.append('images', new Blob([bytes], { type: 'image/png' }), `p${i}.png`);
  return (await fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form })).json();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const C = c.L.compose;
    const nina = await account(`nina96${c.lang}`);
    const post = await photoPost(nina, 'Hill walk', 2);
    const [first, second] = post.media.map((m) => m.url);
    check(`${tag}: (setup) a post with two uploaded photos`, Boolean(first && second), JSON.stringify(post.media));

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [nina.token, nina.id, nina.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(`${WEB}/posts/${post.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: c.L.postMenu.moreOptions, exact: true }).click();
    await page.getByRole('menuitem', { name: c.L.postMenu.edit, exact: true }).click();
    check(`${tag}: "Edit post" opens the composer`, await shows(page.getByRole('heading', { name: C.editTitle, exact: true })));
    const text = page.getByRole('textbox', { name: C.postLabel });
    check(`${tag}: ...with her text`, (await text.inputValue()) === 'Hill walk');
    const tiles = page.locator('.image-picker-item img');
    await tiles.nth(1).waitFor({ timeout: 10000 });
    check(`${tag}: ...and her two photos`, (await tiles.count()) === 2);

    // "Earlier" points to the start: left in English, right in Arabic (the
    // chevron is mirrored in RTL).
    const earlier = page.getByRole('button', { name: C.moveEarlier.replace('{{n}}', '2'), exact: true });
    const mirrored = await earlier.locator('svg').evaluate((svg) => getComputedStyle(svg).transform);
    check(`${tag}: "earlier" points to the start`, c.lang === 'ar' ? mirrored.startsWith('matrix(-1') : !mirrored.startsWith('matrix(-1'), mirrored);
    // Photo 2 first, the other removed, a new one added and described.
    await earlier.click();
    await page.getByRole('button', { name: C.removeImage.replace('{{n}}', '2'), exact: true }).click();
    await page.locator('input[type=file]').setInputFiles(PHOTO);
    await page.locator('.image-picker-item').nth(1).waitFor({ timeout: 10000 }); // shrunk first (Day 57)
    await page.getByRole('button', { name: C.altAdd.replace('{{n}}', '2'), exact: true }).click();
    await page.getByRole('dialog').getByLabel(C.altLabel, { exact: true }).fill('The summit cairn');
    await page.getByRole('dialog').getByRole('button', { name: c.L.common.save, exact: true }).click();
    await text.fill('Hill walk, the summit');
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.waitForTimeout(700);
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(() => window.axe.run('form'));
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
    check(`${tag}: the composer has no serious axe issues`, serious.length === 0, serious.join(', '));
    await page.screenshot({ path: path.join(SP, `day96-edit-photos-${c.lang}-${c.theme}.png`), fullPage: true });

    await page.getByRole('button', { name: c.L.common.save, exact: true }).click();
    await page.waitForURL((u) => u.pathname === `/posts/${post.id}`, { timeout: 20000 }).catch(() => {});
    check(`${tag}: Save returns to the post`, page.url().endsWith(`/posts/${post.id}`), page.url());
    check(`${tag}: ...showing her new words`, await shows(page.locator('.post-card-body', { hasText: 'Hill walk, the summit' })));
    const saved = await (await fetch(`${API}/posts/${post.id}`, { headers: as(nina) })).json();
    const urls = saved.media.map((m) => m.url);
    check(`${tag}: the photos are in her order: the old photo 2, then the new one`, urls.length === 2 && urls[0] === second && urls[1] !== first, JSON.stringify(saved.media));
    check(`${tag}: ...the new one described`, saved.media[1]?.alt === 'The summit cairn');
    const shown = await page.locator('.post-card-media img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')));
    check(`${tag}: the post page shows them in that order`, shown.length === 2 && shown[0].includes(second.split('/').pop().split('.')[0]), JSON.stringify(shown));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
