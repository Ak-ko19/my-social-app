// C2: Terms & Privacy pages -- public, linked from Settings and Signup, both languages.
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
  const watch = (p) => { p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', (e) => errors.push(e.message)); return p; };

  // Logged out: signup links to both documents.
  const anon = watch(await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage());
  await anon.goto(`${WEB}/signup`, { waitUntil: 'networkidle' });
  await anon.getByRole('link', { name: 'Terms' }).click();
  await anon.waitForURL(`${WEB}/terms`);
  await anon.getByRole('heading', { name: 'Terms & Conditions' }).waitFor();
  const n = await anon.locator('.legal-section').count();
  check('Terms page opens logged out from Signup, with 8 sections + draft note', n === 8 && (await anon.getByRole('note').count()) === 1, `${n}`);
  check('Terms keep their own date (27 September 2026)', (await anon.locator('.legal-updated').innerText()).includes('September 27, 2026'));
  await anon.getByRole('link', { name: 'Read the Privacy Policy' }).click();
  await anon.getByRole('heading', { name: 'Privacy Policy' }).waitFor();
  check('cross-link to Privacy Policy', (await anon.getByText(/Cloudinary/).count()) === 1);
  // Day 28: the policy now matches the app -- 11 sections, its own date,
  // and it covers the new things (data download, retention, link previews).
  const privacyText = await anon.locator('.legal-body').innerText();
  check('Privacy Policy (Day 28): 11 sections dated 5 October 2026', (await anon.locator('.legal-section').count()) === 11 && privacyText.includes('October 5, 2026'), privacyText.slice(0, 120));
  check('it covers data download, retention, link previews and push', ['download a copy of your information', 'How long we keep it', 'preview card', 'push service'].every((p) => privacyText.includes(p)));
  await anon.getByRole('button', { name: 'Back' }).click();
  await anon.waitForURL(`${WEB}/terms`);
  check('back returns to the previous page', true);

  // Logged in: Settings rows now open the pages.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([t]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
  }, [aliceToken]);
  const me = watch(await ctx.newPage());
  await me.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await me.getByRole('button', { name: 'Privacy Policy' }).click();
  await me.waitForURL(`${WEB}/privacy`);
  check('Settings > Privacy Policy row opens the page', true);
  await me.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await me.getByRole('button', { name: 'Terms & Conditions' }).click();
  await me.waitForURL(`${WEB}/terms`);
  check('Settings > Terms row opens the page', true);

  // Myanmar version.
  const myCtx = await browser.newContext({ viewport: { width: 375, height: 844 } });
  await myCtx.addInitScript(() => { localStorage.setItem('lang', 'my'); localStorage.setItem('theme', 'dark'); });
  const mp = watch(await myCtx.newPage());
  await mp.goto(`${WEB}/privacy`, { waitUntil: 'networkidle' });
  await mp.getByRole('heading', { name: 'ကိုယ်ရေးလုံခြုံမှု မူဝါဒ' }).waitFor();
  check('Myanmar Privacy Policy renders', (await mp.locator('.legal-section').count()) === 11);
  const updated = await mp.locator('.legal-updated').innerText();
  check('date is in Burmese even though Chromium has no Burmese ICU data', updated.includes('၂၀၂၆ အောက်တိုဘာ ၅'), updated);
  check('375px dark Myanmar: no horizontal scroll', !(await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
  await mp.screenshot({ path: path.join(SP, 'c2-privacy-my-dark-375.png') });

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
