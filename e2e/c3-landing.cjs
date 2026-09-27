// C3: public landing page.
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
  const watch = (p) => { p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', (e) => errors.push(e.message)); p.on('requestfailed', (r) => errors.push('request failed: ' + r.url().slice(0, 100) + ' ' + (r.failure()?.errorText || ''))); return p; };

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = watch(await ctx.newPage());
  await p.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await p.waitForURL(`${WEB}/welcome`);
  check('logged-out "/" lands on /welcome', true);
  await p.getByRole('heading', { level: 1 }).waitFor();
  check('hero + 6 features + Terms/Privacy links', (await p.locator('.landing-feature').count()) === 6 && (await p.getByRole('link', { name: 'Terms' }).count()) === 1 && (await p.getByRole('link', { name: 'Privacy' }).count()) === 1);
  check('no bottom tab bar (outside the app shell)', (await p.locator('.bottom-tab-bar').count()) === 0);
  await p.getByRole('link', { name: 'Create your free account' }).first().click();
  await p.waitForURL(`${WEB}/signup`);
  check('primary CTA opens Signup', true);
  await p.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: 'I already have an account' }).click();
  await p.waitForURL(`${WEB}/login`);
  check('secondary CTA opens Login', true);

  await p.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  await p.locator('.landing-lang-select').selectOption('my');
  await p.getByRole('link', { name: 'အခမဲ့ အကောင့်ဖွင့်ရန်' }).first().waitFor();
  check('language switch on the landing page', (await p.getAttribute('html', 'lang')) === 'my');
  await p.locator('.landing-lang-select').selectOption('ar');
  await p.getByRole('link', { name: 'أنشئ حسابك المجاني' }).first().waitFor();
  check('Arabic from the landing page switches to RTL', (await p.getAttribute('html', 'dir')) === 'rtl');
  await p.locator('.landing-lang-select').selectOption('en');
  await p.getByRole('link', { name: 'Create your free account' }).first().waitFor();

  // Logged in: "Open the app" instead of sign-up CTAs; "/" stays on Home.
  const li = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await li.addInitScript(([t]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
  }, [aliceToken]);
  const lp = watch(await li.newPage());
  await lp.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  check('logged-in "/" is still Home', lp.url() === `${WEB}/`);
  await lp.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
  check('logged-in visitor sees "Open the app"', (await lp.getByRole('link', { name: 'Open the app' }).count()) === 1 && (await lp.getByRole('link', { name: 'Create your free account' }).count()) === 0);

  // Layout: phone / tablet / desktop, light + dark, both languages.
  for (const lang of ['en', 'my', 'ar']) {
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 768, 1280]) {
        const c = await browser.newContext({ viewport: { width, height: 900 } });
        await c.addInitScript(([l, th]) => { localStorage.setItem('lang', l); localStorage.setItem('theme', th); }, [lang, theme]);
        const q = watch(await c.newPage());
        await q.goto(`${WEB}/welcome`, { waitUntil: 'networkidle' });
        await q.locator('.landing-feature').first().waitFor();
        const hs = await q.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        check(`${lang} ${theme} ${width}px: no horizontal scroll`, !hs);
        if ((width === 375 || width === 1280) && theme === (lang === 'en' ? 'light' : 'dark')) {
          await q.screenshot({ path: path.join(SP, `c3-landing-${lang}-${theme}-${width}.png`), fullPage: width === 375 });
        }
        await c.close();
      }
    }
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
