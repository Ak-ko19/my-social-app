// Day 11 step 2: the optional Turnstile check, switched ON (run-all.sh starts
// this suite's stack with E2E_TURNSTILE=1 on the production build, so the
// real CSP from vercel.json applies). Cloudflare is never contacted: its
// script is replaced by a fake widget served from Cloudflare's own URL (so
// the CSP's script-src/frame-src are exercised), and the backend verifies
// tokens with the local stub (turnstile-stub.cjs: "human-ok" passes).
// EN/MY/AR (RTL), light/dark, 375-430px.
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
const NEEDED = {
  en: 'Please complete the security check.',
  my: 'လုံခြုံရေး စစ်ဆေးမှုကို အရင် ပြီးအောင်လုပ်ပါ။',
  ar: 'يرجى إكمال التحقق الأمني أولًا.'
};

const FAKE_WIDGET = `
window.__ts = { renders: [], resets: 0, removes: 0 };
window.turnstile = (() => {
  let n = 0;
  const boxes = {};
  return {
    render(el, opts) {
      const id = 'w' + (++n);
      window.__ts.renders.push({ sitekey: opts.sitekey, theme: opts.theme });
      const frame = document.createElement('iframe');
      frame.src = 'https://challenges.cloudflare.com/fake-frame';
      frame.title = 'Security check';
      frame.style.cssText = 'width:300px;height:65px;border:0;display:block';
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'fake-ts-tick';
      tick.textContent = 'I am human';
      tick.onclick = () => opts.callback('human-ok');
      el.append(frame, tick);
      boxes[id] = el;
      return id;
    },
    reset() { window.__ts.resets += 1; },
    remove(id) { window.__ts.removes += 1; if (boxes[id]) boxes[id].innerHTML = ''; delete boxes[id]; }
  };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage({ lang = 'en', theme = 'light', width = 375 }) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([l, th]) => { localStorage.setItem('lang', l); localStorage.setItem('theme', th); }, [lang, theme]);
    const page = await ctx.newPage();
    page.cloudflareRequests = [];
    await page.route('https://challenges.cloudflare.com/**', (route) => {
      const url = route.request().url();
      page.cloudflareRequests.push(url);
      if (url.includes('/turnstile/v0/api.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_WIDGET });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>check</title><p>check</p>' });
    });
    page.on('console', (m) => {
      if (m.type() === 'error' && !/status of 400/.test(m.text()) && !/AxiosError|Request failed|Please complete the security check/.test(m.text())) errors.push(`${lang}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    return page;
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const ts = (page) => page.evaluate(() => window.__ts);

  // 1. Signup: the widget shows (right key and theme), the form refuses to
  // go without it, and goes through once it is ticked.
  for (const [lang, theme, width] of [['en', 'light', 375], ['my', 'dark', 390], ['ar', 'dark', 430]]) {
    const label = `${lang}/${theme}/${width}px`;
    const name = `ts${lang}${Date.now() % 100000}`;
    const page = await newPage({ lang, theme, width });
    await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
    await page.locator('.turnstile-box iframe').waitFor({ timeout: 8000 }).catch(() => {});
    const state = await ts(page);
    check(`${label}: widget rendered once, with the site key from /config`, state?.renders.length === 1 && state.renders[0].sitekey === 'e2e-turnstile-site-key', JSON.stringify(state));
    check(`${label}: widget follows the app theme`, state?.renders[0]?.theme === theme);
    check(`${label}: Cloudflare frame allowed by the CSP`, (await page.locator('.turnstile-box iframe').count()) === 1);

    const inputs = page.locator('form input:not([name=website])');
    await inputs.nth(0).fill(name);
    await inputs.nth(1).fill(`${name}@example.com`);
    await inputs.nth(2).fill('a-fine-password-123');
    await page.locator('form button[type=submit]').click();
    const err = page.locator('.form-error');
    await err.waitFor({ timeout: 5000 }).catch(() => {});
    check(`${label}: not ticked -> "complete the security check", translated`, (await err.innerText().catch(() => '')) === NEEDED[lang], await err.innerText().catch(() => ''));

    await page.locator('.fake-ts-tick').click();
    await page.locator('form button[type=submit]').click();
    const ok = page.getByText(locale(lang).auth.signupSuccess);
    await ok.waitFor({ timeout: 10000 }).catch(() => {});
    check(`${label}: ticked -> signed up`, (await ok.count()) === 1);
    check(`${label}: widget reset after the attempt (tokens are single-use)`, (await ts(page)).resets >= 1);
    check(`${label}: no horizontal scroll with the 300px widget`, await noHScroll(page));
    await page.screenshot({ path: path.join(SP, `day11-turnstile-signup-${lang}-${theme}-${width}.png`) });
    await page.context().close();
  }

  // 2. A failed attempt used up the token: the next try needs a new tick.
  {
    const page = await newPage({});
    await page.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
    await page.locator('.fake-ts-tick').waitFor({ timeout: 8000 }).catch(() => {});
    const inputs = page.locator('form input:not([name=website])');
    await inputs.nth(0).fill('alice'); // taken -> the server says so
    await inputs.nth(1).fill(`other${Date.now() % 100000}@example.com`);
    await inputs.nth(2).fill('a-fine-password-123');
    await page.locator('.fake-ts-tick').click();
    await page.locator('form button[type=submit]').click();
    const err = page.locator('.form-error');
    await page.getByText('Email or username already exists').waitFor({ timeout: 10000 }).catch(() => {});
    check('failed attempt shows the server\'s reason', (await err.innerText().catch(() => '')) === 'Email or username already exists');
    await inputs.nth(0).fill(`fresh${Date.now() % 100000}`);
    await page.locator('form button[type=submit]').click();
    await page.getByText(NEEDED.en).waitFor({ timeout: 5000 }).catch(() => {});
    check('...and the retry asks for a new tick', (await err.innerText().catch(() => '')) === NEEDED.en);
    await page.context().close();
  }

  // 3. Forgot password: same widget, same rule.
  {
    const page = await newPage({ lang: 'ar', theme: 'dark', width: 430 });
    await page.goto(`${WEB}/forgot-password`, { waitUntil: 'networkidle' });
    await page.locator('.fake-ts-tick').waitFor({ timeout: 8000 }).catch(() => {});
    await page.locator('input[type=email]').fill('alice@example.com');
    await page.locator('.fake-ts-tick').click();
    await page.locator('form button[type=submit]').click();
    const sent = page.locator('.form-success');
    await sent.waitFor({ timeout: 10000 }).catch(() => {});
    check('ar: forgot password with the widget ticked -> sent', (await sent.count()) === 1 && (await page.locator('.form-error').count()) === 0);
    check('ar: forgot: no horizontal scroll', await noHScroll(page));
    await page.context().close();
  }

  // 4. Login has no widget and never loads Cloudflare's script.
  {
    const page = await newPage({});
    await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
    check('login: no widget', (await page.locator('.turnstile-box').count()) === 0);
    check('login: Cloudflare not contacted', page.cloudflareRequests.length === 0, page.cloudflareRequests.join(' '));
    await page.locator('input[type=email]').fill('alice@example.com');
    await page.locator('input[type=password]').fill('a-fine-password-123');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(`${WEB}/`, { timeout: 8000 }).catch(() => {});
    check('login: works as before', page.url() === `${WEB}/`);
    await page.context().close();
  }

  // 5. Straight to the API: no token, or one the verifier rejects -> 400.
  const post = (body) => fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const base = { username: 'scripted', email: 'scripted@example.com', password: 'a-fine-password-123' };
  const none = await post(base);
  check('API: signup without a Turnstile token -> 400', none.status === 400 && (await none.text()) === NEEDED.en);
  const forged = await post({ ...base, turnstileToken: 'robot' });
  check('API: signup with a rejected token -> 400', forged.status === 400 && (await forged.text()) === NEEDED.en);
  const config = await fetch(`${API}/config`).then((r) => r.json());
  check('API: /config shares the site key, not the secret', config.turnstileSiteKey === 'e2e-turnstile-site-key' && !JSON.stringify(config).includes('secret'));

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
