// B15 language switch in headless Edge (throwaway stack from e2e-up.sh).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

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
  await page.getByText('မြန်မာ').click();
  await page.getByRole('heading', { name: 'ဘာသာစကား' }).waitFor();
  check('switching shows Myanmar immediately', true);
  check('html lang=my', (await page.getAttribute('html', 'lang')) === 'my');
  const tabs = await page.locator('.bottom-tab-label').allInnerTexts();
  check('tab bar translated', tabs.join('|') === 'ပင်မ|ဗီဒီယို|Shorts|မက်ဆေ့ချ်|ပရိုဖိုင်', tabs.join('|'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'ဘာသာစကား' }).waitFor();
  check('choice persists across reload', (await page.getAttribute('html', 'lang')) === 'my');
  await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'ဆက်တင်များ' }).waitFor();
  check('settings rows translated; language row shows current value', (await page.getByText('မြန်မာ').count()) >= 1 && (await page.getByText('ဘာသာစကား').count()) >= 1);
  const fontOk = await page.evaluate(() => document.fonts.check('16px "Noto Sans Myanmar"', 'မြန်မာ'));
  check('Noto Sans Myanmar available for Burmese text', fontOk);

  // Back to English.
  await page.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await page.getByText('English').click();
  await page.getByRole('heading', { name: 'Language' }).waitFor();
  check('switch back to English', (await page.getAttribute('html', 'lang')) === 'en');

  const small = await browser.newContext({ viewport: { width: 375, height: 844 } });
  await small.addInitScript(([t]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
    localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', 'my'); localStorage.setItem('theme', 'dark');
  }, [aliceToken]);
  const sp = await small.newPage();
  await sp.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await sp.getByRole('heading', { name: 'ဘာသာစကား' }).waitFor();
  await sp.waitForTimeout(500);
  check('375px dark Myanmar: no horizontal scroll', !(await sp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await sp.screenshot({ path: path.join(SP, 'b15-language-dark-375.png') });

  // Server error text is translated (known message), and dates/times follow the language.
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await anon.addInitScript(() => localStorage.setItem('lang', 'my'));
  const lp = await anon.newPage();
  lp.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await lp.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await lp.getByLabel('အီးမေးလ်').fill('alice@example.com');
  await lp.getByLabel('စကားဝှက်').fill('wrong-password-123');
  await lp.getByRole('button', { name: 'ဝင်ရောက်ရန်' }).click();
  const alertText = await lp.getByRole('alert').innerText();
  check('server error shown in Burmese on login', alertText.includes('အီးမေးလ် သို့မဟုတ် စကားဝှက် မှားနေပါသည်'), alertText);
  await anon.close();

  const home = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await home.addInitScript(([t]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
    localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', 'my');
  }, [aliceToken]);
  const hp = await home.newPage();
  await hp.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await hp.locator('article.post-card').first().waitFor();
  const meta = await hp.locator('article.post-card .post-card-meta').first().innerText();
  check('relative time in Burmese on posts', /ယခုလေးတင်|မိနစ်က|နာရီက/.test(meta), meta);
  check('post actions translated', (await hp.getByRole('button', { name: 'မှတ်ချက်' }).count()) >= 1);
  await home.close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
