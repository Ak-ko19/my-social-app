// Day 72: "Install the app" in the Menu (headless Edge, throwaway stack:
// alice(1)). A desktop browser that offers installing (a stand-in for its
// beforeinstallprompt event) gets the row, and the row opens the browser's
// own dialog, once; without an offer there is no row. An iPhone gets the
// row too, and it shows how to add the app from Safari -- here in Arabic,
// right to left, dark, 375px.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const AR = require('../frontend/src/i18n/locales/ar.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async ({ lang = 'en', theme = 'light', userAgent } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, ...(userAgent && { userAgent }) });
    await ctx.addInitScript(([t, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
      localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [aliceToken, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${WEB}/menu`, { waitUntil: 'networkidle' });
    return page;
  };

  // Desktop, no offer: no row.
  const plain = await open();
  check('no install offer from the browser: no "Install the app" row', (await plain.getByRole('button', { name: /Install the app/ }).count()) === 0);

  // The browser offers it.
  await plain.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.installPrompted = 0;
    event.prompt = () => { window.installPrompted += 1; return Promise.resolve(); };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  const row = plain.getByRole('button', { name: /Install the app/ });
  await row.waitFor({ timeout: 5000 });
  check('the browser offers it: the row appears', (await row.count()) === 1);
  await row.click();
  await row.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  check("tapping it opens the browser's own install dialog, once, and the row goes", (await plain.evaluate(() => window.installPrompted)) === 1 && (await row.count()) === 0);

  // iPhone, in Arabic.
  const phone = await open({ lang: 'ar', theme: 'dark', userAgent: IPHONE });
  const arRow = phone.getByRole('button', { name: new RegExp(AR.menu.install) });
  await arRow.waitFor({ timeout: 5000 });
  await arRow.click();
  const sheet = phone.getByRole('dialog', { name: AR.menu.installIosTitle });
  await sheet.waitFor({ timeout: 5000 });
  check('iPhone: the row shows how to add the app from Safari (Arabic)', (await sheet.getByText(AR.menu.installIosStep1).count()) === 1 && (await sheet.getByText(AR.menu.installIosStep2).count()) === 1);
  const layout = await phone.evaluate(() => ({ dir: document.documentElement.dir, sideways: document.documentElement.scrollWidth > window.innerWidth }));
  check('...right to left, no sideways scroll', layout.dir === 'rtl' && !layout.sideways);
  await phone.waitForTimeout(600); // the sheet slides up
  await phone.screenshot({ path: path.join(SP, 'day72-install-ios-ar-dark-375.png') });
  await phone.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  check('Escape closes it', (await sheet.count()) === 0);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
