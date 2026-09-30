// Day 11 step 1: bot protection, with the backend's real checks ON
// (run-all.sh starts this suite's stack with BOT_CHECKS_IN_TESTS=1).
// Real people using the real forms never notice it -- even when they submit
// faster than the minimum fill time -- while a bot posting straight to the
// API, or filling in the hidden honeypot, is refused. EN/MY/AR (RTL),
// light/dark, 375-430px.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const RELOAD = 'Please reload the page and try again.';
const RELOAD_T = { en: RELOAD, my: 'စာမျက်နှာကို ပြန်ဖွင့်ပြီး ထပ်စမ်းကြည့်ပါ။', ar: 'يرجى إعادة تحميل الصفحة والمحاولة مجددًا.' };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage({ lang = 'en', theme = 'light', width = 375 }) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([l, th]) => { localStorage.setItem('lang', l); localStorage.setItem('theme', th); }, [lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      // The deliberate 400/401s below show up as failed-resource errors.
      if (m.type() === 'error' && !/status of 40[01]/.test(m.text()) && !/AxiosError|Request failed/.test(m.text())) errors.push(`${lang}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    return page;
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const fillSignup = async (page, name) => {
    const inputs = page.locator('form input:not([name=website])');
    await inputs.nth(0).fill(name);
    await inputs.nth(1).fill(`${name}@example.com`);
    await inputs.nth(2).fill('a-fine-password-123');
  };

  // 1. Signup at bot speed from a real person's browser: the form waits out
  // the minimum itself and succeeds; then that person logs in.
  for (const [lang, theme, width] of [['en', 'light', 375], ['my', 'dark', 390], ['ar', 'dark', 430]]) {
    const label = `${lang}/${theme}/${width}px`;
    const t = locale(lang).auth;
    const name = `fast${lang}${Date.now() % 100000}`;
    const page = await newPage({ lang, theme, width });
    const started = Date.now();
    await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });

    const hp = page.locator('input[name=website]');
    const box = await page.locator('.hp-field').boundingBox();
    check(`${label}: honeypot is in the form but takes no visible space`, (await hp.count()) === 1 && box && box.width <= 1 && box.height <= 1, JSON.stringify(box));
    check(`${label}: honeypot is hidden from screen readers and the keyboard`,
      (await hp.getAttribute('tabindex')) === '-1' && (await page.locator('.hp-field').getAttribute('aria-hidden')) === 'true');
    check(`${label}: honeypot can't be seen at all`, await page.locator('.hp-field').evaluate((el) => getComputedStyle(el).clipPath !== 'none'));

    await fillSignup(page, name);
    await page.locator('form button[type=submit]').click();
    check(`${label}: submit button is disabled while the form waits`, await page.locator('form button[type=submit]').isDisabled());
    const ok = page.getByText(t.signupSuccess);
    await ok.waitFor({ timeout: 10000 }).catch(() => {});
    check(`${label}: a fast real person still signs up (no error)`, (await ok.count()) === 1 && (await page.locator('.form-error').count()) === 0);
    check(`${label}: ...after the 3 s minimum`, Date.now() - started >= 2900, `${Date.now() - started} ms`);
    check(`${label}: signup: no horizontal scroll`, await noHScroll(page));
    await page.screenshot({ path: path.join(SP, `day11-signup-${lang}-${theme}-${width}.png`) });

    await page.waitForURL(`${WEB}/login`, { timeout: 5000 }).catch(() => {});
    await page.locator('input[type=email]').fill(`${name}@example.com`);
    await page.locator('input[type=password]').fill('a-fine-password-123');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(`${WEB}/`, { timeout: 8000 }).catch(() => {});
    check(`${label}: and then logs in`, page.url() === `${WEB}/`, page.url());
    await page.context().close();
  }

  // 2. A bot filling in every input, honeypot included, is refused -- with
  // a message the person (if it was one) can understand, in their language.
  for (const lang of ['en', 'my', 'ar']) {
    const page = await newPage({ lang });
    await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
    await fillSignup(page, `bot${lang}${Date.now() % 100000}`);
    await page.locator('input[name=website]').fill('http://spam.example', { force: true });
    await page.locator('form button[type=submit]').click();
    const err = page.locator('.form-error');
    await err.waitFor({ timeout: 10000 }).catch(() => {});
    check(`${lang}: honeypot filled -> refused, translated`, (await err.count()) === 1 && (await err.innerText()) === RELOAD_T[lang], await err.innerText().catch(() => ''));
    await page.context().close();
  }

  // 3. Straight to the API, no form: refused.
  const direct = await fetch(`${API}/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'scripted', email: 'scripted@example.com', password: 'a-fine-password-123' })
  });
  check('API: signup without a form token -> 400', direct.status === 400 && (await direct.text()) === RELOAD);
  const tooFast = await fetch(`${API}/form-token`).then((r) => r.json()).then(({ token }) => fetch(`${API}/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'scripted2', email: 'scripted2@example.com', password: 'a-fine-password-123', formToken: token })
  }));
  check('API: signup with a brand-new token -> "wait a moment"', tooFast.status === 400 && (await tooFast.text()) === 'Please wait a moment and try again.');

  // 4. A token that went stale while the tab sat open is replaced quietly.
  {
    const page = await newPage({});
    let served = 0;
    await page.route('**/form-token', async (route) => {
      served += 1;
      if (served === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: `${Date.now() - 3 * 60 * 60 * 1000}.stale` }) });
      return route.continue();
    });
    await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
    await fillSignup(page, `stale${Date.now() % 100000}`);
    await page.locator('form button[type=submit]').click();
    const ok = page.getByText(locale('en').auth.signupSuccess);
    await ok.waitFor({ timeout: 12000 }).catch(() => {});
    check('stale token: fetched again and the signup goes through', (await ok.count()) === 1 && served === 2, `form-token served ${served}x`);
    await page.context().close();
  }

  // 5. Forgot password at bot speed from the real form: waits, then sends.
  for (const [lang, theme, width] of [['en', 'light', 375], ['ar', 'dark', 430]]) {
    const page = await newPage({ lang, theme, width });
    const started = Date.now();
    await page.goto(`${WEB}/forgot-password`, { waitUntil: 'networkidle' });
    await page.locator('input[type=email]').fill('alice@example.com');
    await page.locator('form button[type=submit]').click();
    const sent = page.locator('.form-success');
    await sent.waitFor({ timeout: 10000 }).catch(() => {});
    check(`${lang}: forgot password sends from a fast real form`, (await sent.count()) === 1 && (await page.locator('.form-error').count()) === 0);
    check(`${lang}: ...after the 2 s minimum`, Date.now() - started >= 1900, `${Date.now() - started} ms`);
    check(`${lang}: forgot: no horizontal scroll`, await noHScroll(page));
    await page.context().close();
  }

  // 6. Login: 3 wrong passwords are answered at once, the next attempt is
  // slowed (the button stays disabled), and the right password still works.
  {
    const page = await newPage({});
    await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    const submit = page.locator('form button[type=submit]');
    await page.locator('input[type=email]').fill('bob@example.com');
    const times = [];
    for (let i = 0; i < 3; i += 1) {
      await page.locator('input[type=password]').fill(`wrong-password-${i}`);
      const t0 = Date.now();
      const [res] = await Promise.all([page.waitForResponse('**/login'), submit.click()]);
      times.push([res.status(), Date.now() - t0]);
    }
    check('login: first 3 wrong passwords answered at once (401)', times.every(([s, ms]) => s === 401 && ms < 900), JSON.stringify(times));
    check('login: wrong password shows the usual message', (await page.locator('.form-error').count()) === 1);
    await page.locator('input[type=password]').fill('a-fine-password-123');
    const t0 = Date.now();
    const pending = page.waitForResponse('**/login');
    await submit.click();
    await page.waitForTimeout(300);
    check('login: button disabled while the slowed attempt waits', await submit.isDisabled());
    const res = await pending;
    check('login: 4th attempt slowed by ~1 s, right password gets in', res.status() === 200 && Date.now() - t0 >= 950, `${res.status()} after ${Date.now() - t0} ms`);
    await page.waitForURL(`${WEB}/`, { timeout: 5000 }).catch(() => {});
    check('login: lands on Home', page.url() === `${WEB}/`);
    await page.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
