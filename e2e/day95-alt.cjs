// Day 95: photo descriptions (alt text). Nina writes a post with two
// photos (really uploaded, through e2e/cloudinary-stub.cjs), describes the
// second one in the Alt dialog ("Describe photo 2"), and posts it. On Home
// that photo's img is read by her description and the other keeps the
// automatic "Photo 1 of 2 ..."; the API returns it too. axe on the dialog.
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

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: { Authorization: `Bearer ${me.token}` } });
  return me;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const C = c.L.compose;
    const nina = await account(`nina95${c.lang}`);
    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [nina.token, nina.id, nina.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
    await page.getByRole('textbox', { name: C.postLabel }).fill('Hill walk');
    await page.locator('input[type=file]').setInputFiles([PHOTO, PHOTO]);
    await page.locator('.image-picker-item').nth(1).waitFor({ timeout: 10000 }); // shrunk first (Day 57)
    const add = (n) => page.getByRole('button', { name: C.altAdd.replace('{{n}}', String(n)), exact: true });
    check(`${tag}: each photo has an Alt button`, await shows(add(1)) && await shows(add(2)));
    check(`${tag}: ...showing its short word`, (await add(2).innerText()).trim() === C.altShort);
    await add(2).click();
    const dialog = page.getByRole('dialog', { name: C.altTitle.replace('{{n}}', '2') });
    check(`${tag}: it opens "Describe photo 2"`, await shows(dialog));
    await dialog.getByLabel(C.altLabel, { exact: true }).fill('A red kite over the green hill');
    await page.waitForTimeout(700); // the dialog's entrance animation
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(() => window.axe.run('.alt-text-dialog'));
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
    check(`${tag}: the dialog has no serious axe issues`, serious.length === 0, serious.join(', '));
    await page.screenshot({ path: path.join(SP, `day95-alt-dialog-${c.lang}-${c.theme}.png`) });
    await dialog.getByRole('button', { name: c.L.common.save, exact: true }).click();
    check(`${tag}: photo 2 now says it is described`, await shows(page.getByRole('button', { name: C.altEdit.replace('{{n}}', '2'), exact: true })));
    await page.screenshot({ path: path.join(SP, `day95-alt-composer-${c.lang}-${c.theme}.png`) });
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

    await page.getByRole('button', { name: C.post, exact: true }).click();
    await page.waitForURL((u) => !/create-post/.test(u.pathname), { timeout: 20000 }).catch(() => {});
    const card = page.locator('article.post-card', { hasText: 'Hill walk' });
    check(`${tag}: the post is on Home`, await shows(card));
    const alts = await card.locator('.post-card-media img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt')));
    check(`${tag}: photo 2 is read by her description`, alts[1] === 'A red kite over the green hill', JSON.stringify(alts));
    check(`${tag}: ...photo 1 keeps the automatic text`, Boolean(alts[0]) && alts[0] !== alts[1], JSON.stringify(alts));
    const feed = await (await fetch(`${API}/feed`, { headers: { Authorization: `Bearer ${nina.token}` } })).json();
    const media = feed.posts.find((p) => p.content === 'Hill walk')?.media;
    check(`${tag}: the API returns it with the photo`, JSON.stringify(media?.map((m) => m.alt)) === JSON.stringify([null, 'A red kite over the green hill']), JSON.stringify(media));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
