// Day 77: "New login" alerts. alice (first device: the seed's own login)
// logs in through the real form on an iPhone; on her computer, already
// signed in, the alert names "Safari on iOS" and "Check your devices"
// opens the list of signed-in devices -- in EN/light and AR/dark (RTL).
// Throwaway stack from e2e-up.sh.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const EN = require('../frontend/src/i18n/locales/en.json');
const AR = require('../frontend/src/i18n/locales/ar.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const token = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // The phone: a fresh browser, the real log-in form.
  const phone = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 } });
  const p = await phone.newPage();
  p.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
  await p.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await p.getByLabel('Email').fill('alice@example.com');
  await p.getByLabel('Password').fill('a-fine-password-123');
  await p.getByRole('button', { name: 'Log in' }).click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  check('the phone logs in as usual', true);
  await phone.close();

  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [token, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
    const device = c.L.sessions.device.replace('{{browser}}', 'Safari').replace('{{os}}', 'iOS');
    const title = c.L.notifications.types.newLogin.match(/<b>(.*?)<\/b>/)[1];
    const item = page.locator('li.card-row', { has: page.locator('strong', { hasText: title }) });
    await item.first().waitFor({ timeout: 8000 }).catch(() => {});
    const text = await item.first().innerText().catch(() => '');
    check(`${tag}: one "new login" alert`, (await item.count()) === 1, String(await item.count()));
    check(`${tag}: it names the phone`, text.includes(device), text.replace(/\s+/g, ' ').slice(0, 140));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
    await page.screenshot({ path: path.join(SP, `day77-login-alert-${c.lang}-${c.theme}-${c.width}.png`) });
    await item.first().getByRole('button', { name: c.L.notifications.checkDevices, exact: true }).click();
    await page.waitForURL(/\/settings\/sessions$/, { timeout: 8000 }).catch(() => {});
    check(`${tag}: "check your devices" opens the device list`, /\/settings\/sessions$/.test(page.url()), page.url());
    const sessions = await page.locator('body').innerText();
    check(`${tag}: ...where the phone is listed`, sessions.includes(device));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
