// B15 language switch in headless Edge (throwaway stack from e2e-up.sh).
// Owner decision 2026-10-07: the UI languages are English and Arabic only
// (Myanmar was removed) -- so this switches to Arabic, and checks that a
// device still holding the old Myanmar choice opens in English.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const AR = JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const seedAuth = ([t, lang, theme]) => {
  localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
  localStorage.setItem('emailVerified', 'true');
  if (lang) localStorage.setItem('lang', lang);
  if (theme) localStorage.setItem('theme', theme);
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([t]) => {
    // Only seed auth once -- the language must survive reloads on its own.
    if (!localStorage.getItem('token')) {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
    }
  }, [aliceToken]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  check('default is English (html lang=en)', (await page.getAttribute('html', 'lang')) === 'en');
  await page.getByRole('button', { name: /^Language/ }).click();
  await page.waitForURL(`${WEB}/settings/language`);
  await page.locator('label.language-option').first().waitFor();
  const options = await page.locator('label.language-option').allInnerTexts();
  check('only English and Arabic are offered', options.map((o) => o.trim()).join('|') === 'English|العربية', options.join('|'));
  await page.getByText('العربية').click();
  await page.getByRole('heading', { name: AR.language.title }).waitFor();
  check('switching shows Arabic immediately', true);
  check('html lang=ar dir=rtl', (await page.getAttribute('html', 'lang')) === 'ar' && (await page.getAttribute('html', 'dir')) === 'rtl');
  const tabs = await page.locator('.bottom-tab-label').allInnerTexts();
  const wantTabs = ['home', 'videos', 'shorts', 'messages', 'profile'].map((k) => AR.nav[k]).join('|');
  check('tab bar translated', tabs.join('|') === wantTabs, tabs.join('|'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: AR.language.title }).waitFor();
  check('choice persists across reload', (await page.getAttribute('html', 'lang')) === 'ar');
  await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: AR.settings.title }).waitFor();
  check('settings rows translated; language row shows current value', (await page.getByText('العربية').count()) >= 1 && (await page.getByText(AR.settings.rows.language, { exact: true }).count()) >= 1);
  const fontOk = await page.evaluate(() => document.fonts.check('16px "Noto Sans Arabic"', 'العربية'));
  check('Noto Sans Arabic available for Arabic text', fontOk);
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family); });
  check('no Myanmar web font is loaded', !fonts.some((f) => /myanmar/i.test(f)), fonts.join(', '));

  // Back to English.
  await page.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await page.getByText('English').click();
  await page.getByRole('heading', { name: 'Language' }).waitFor();
  check('switch back to English', (await page.getAttribute('html', 'lang')) === 'en' && (await page.getAttribute('html', 'dir')) === 'ltr');

  const small = await browser.newContext({ viewport: { width: 375, height: 844 } });
  await small.addInitScript(seedAuth, [aliceToken, 'ar', 'dark']);
  const sp = await small.newPage();
  await sp.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await sp.getByRole('heading', { name: AR.language.title }).waitFor();
  await sp.waitForTimeout(500);
  check('375px dark Arabic: no horizontal scroll', await noHScroll(sp));
  await sp.screenshot({ path: path.join(SP, 'b15-language-dark-375.png') });
  await small.close();

  // A device that still has the removed Myanmar choice saved opens in
  // English (and saves that), with nothing broken.
  const old = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await old.addInitScript(([t]) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', 'my');
    }
  }, [aliceToken]);
  const op = await old.newPage();
  op.on('pageerror', (e) => errors.push(`old device: ${e.message}`));
  await op.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await op.getByRole('heading', { name: 'Settings' }).waitFor();
  check('saved Myanmar choice: opens in English', (await op.getAttribute('html', 'lang')) === 'en' && (await op.getAttribute('html', 'dir')) === 'ltr');
  check('...and the device now remembers English', (await op.evaluate(() => localStorage.getItem('lang'))) === 'en');
  check('...the Language row says English', (await op.locator('.settings-row-value').filter({ hasText: 'English' }).count()) === 1);
  await old.close();

  // Server error text is translated (known message), and dates/times follow the language.
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await anon.addInitScript(() => localStorage.setItem('lang', 'ar'));
  const lp = await anon.newPage();
  lp.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await lp.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await lp.getByLabel(AR.auth.email).fill('alice@example.com');
  await lp.getByLabel(AR.auth.password).fill('wrong-password-123');
  await lp.getByRole('button', { name: AR.auth.logIn, exact: true }).click();
  const alertText = await lp.getByRole('alert').innerText();
  check('server error shown in Arabic on login', alertText.includes('البريد الإلكتروني أو كلمة المرور غير صحيحة'), alertText);
  await anon.close();

  const home = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await home.addInitScript(seedAuth, [aliceToken, 'ar']);
  const hp = await home.newPage();
  await hp.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await hp.locator('article.post-card').first().waitFor();
  const meta = await hp.locator('article.post-card .post-card-meta').first().innerText();
  check('relative time in Arabic on posts', /الآن|منذ/.test(meta), meta);
  check('post actions translated', (await hp.getByRole('button', { name: AR.feed.comment }).count()) >= 1);
  check('home: no horizontal scroll in RTL', await noHScroll(hp));
  await home.close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
