// Day 16: the app language is saved on the account and follows the person
// to every device. Throwaway stack (e2e-up.sh): alice(1), bob(2).
// Each "device" is a fresh browser context (its own local storage).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const PASSWORD = 'a-fine-password-123';
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // A brand-new device: nothing in local storage, an English browser.
  async function device({ width = 390 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, locale: 'en-US' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  }
  async function logIn(page, email) {
    await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(`${WEB}/`, { timeout: 8000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
  }
  const htmlLang = (page) => page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const EN = locale('en');
  const AR = locale('ar');

  // 1. Alice has never chosen. Logging in must not write this device's
  // default to her account (that would later override a real choice).
  check('setup: alice has no saved language', sql('SELECT language IS NULL FROM users WHERE id = 1') === 't');
  const laptop = await device();
  await logIn(laptop, 'alice@example.com');
  check('a device default is never saved to the account', sql('SELECT language IS NULL FROM users WHERE id = 1') === 't');

  // 2. She switches to Arabic in Settings -> saved on the account.
  await laptop.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await laptop.locator('label.language-option').first().waitFor();
  const offered = await laptop.locator('label.language-option').allInnerTexts();
  check('the switcher offers English and Arabic only', offered.map((o) => o.trim()).join('|') === 'English|العربية', offered.join('|'));
  await laptop.locator('label.language-option', { hasText: 'العربية' }).click();
  await laptop.getByRole('heading', { name: AR.language.title }).waitFor({ timeout: 5000 }).catch(() => {});
  check('the app switches to Arabic at once, right-to-left', JSON.stringify(await htmlLang(laptop)) === '["ar","rtl"]');
  await laptop.waitForTimeout(500);
  check('...and the account now says Arabic', sql('SELECT language FROM users WHERE id = 1') === 'ar');
  check('the hint says it follows you to every device', (await laptop.getByText(AR.language.hint).count()) === 1);
  check('settings/language: no horizontal scroll (AR)', await noHScroll(laptop));
  await laptop.screenshot({ path: path.join(SP, 'day16-language-ar.png') });

  // 3. A new phone: English login page, then the app comes up in Arabic.
  const phone = await device({ width: 375 });
  await phone.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  check('a new device starts in its own language (English)', (await htmlLang(phone))[0] === 'en' && (await phone.getByRole('heading', { name: EN.auth.welcomeBack }).count()) === 1);
  await logIn(phone, 'alice@example.com');
  check('after login the new device is in Arabic, RTL', JSON.stringify(await htmlLang(phone)) === '["ar","rtl"]', JSON.stringify(await htmlLang(phone)));
  check('...and remembers it on reload', await phone.reload({ waitUntil: 'networkidle' }).then(() => htmlLang(phone)).then(([l]) => l === 'ar'));

  // 4. English chosen again on the phone -> the next new device logs into
  // English, left-to-right.
  await phone.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await phone.locator('label.language-option', { hasText: 'English' }).click();
  await phone.waitForTimeout(500);
  check('the phone switches back to English, left-to-right', JSON.stringify(await htmlLang(phone)) === '["en","ltr"]');
  check('...and the account says English', sql('SELECT language FROM users WHERE id = 1') === 'en');
  const tablet = await device({ width: 430 });
  await logIn(tablet, 'alice@example.com');
  check('a third device logs straight into English', JSON.stringify(await htmlLang(tablet)) === '["en","ltr"]');

  // 5. Picked on the landing page while logged out: that fresh choice wins
  // at the next login on that device, and becomes the account's.
  const kiosk = await device();
  await kiosk.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await kiosk.locator('.landing-lang-select').selectOption('ar');
  await kiosk.waitForFunction(() => document.documentElement.lang === 'ar');
  await logIn(kiosk, 'alice@example.com');
  check('a logged-out pick wins at login (Arabic, not the account\'s English)', (await htmlLang(kiosk))[0] === 'ar');
  await kiosk.waitForTimeout(500);
  check('...and is saved to the account', sql('SELECT language FROM users WHERE id = 1') === 'ar');

  // 6. Signing up after picking Arabic keeps Arabic on the new account.
  const fresh = await device();
  await fresh.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await fresh.locator('.landing-lang-select').selectOption('ar');
  // The choice is saved once its translations have downloaded (the page
  // switches): a full page load before that would drop it.
  await fresh.waitForFunction(() => document.documentElement.lang === 'ar');
  await fresh.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
  const inputs = fresh.locator('form input:not([name=website])');
  await inputs.nth(0).fill('layla');
  await inputs.nth(1).fill('layla@example.com');
  await inputs.nth(2).fill(PASSWORD);
  await fresh.locator('form button[type=submit]').click();
  await fresh.getByText(AR.auth.signupSuccess).waitFor({ timeout: 10000 }).catch(() => {});
  check('an Arabic signup saves Arabic on the account', sql("SELECT language FROM users WHERE username = 'layla'") === 'ar');
  const other = await device();
  await logIn(other, 'layla@example.com');
  check('...so her first login elsewhere is in Arabic', JSON.stringify(await htmlLang(other)) === '["ar","rtl"]');

  // Bob was never touched.
  check('other accounts are unaffected', sql('SELECT language IS NULL FROM users WHERE id = 2') === 't');

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
