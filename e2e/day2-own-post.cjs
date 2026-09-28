// Day 2 step 4: after posting, your own post is the first card on Home
// (audit bug #3), in EN/MY/AR (RTL), light/dark, 375px and desktop.
// Throwaway stack from e2e-up.sh (alice = user 1, follows bob).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

const CASES = [
  { lang: 'en', theme: 'light', width: 375, text: 'Day 2 check: my own post shows up first' },
  { lang: 'my', theme: 'dark', width: 390, text: 'ကိုယ့်ပို့စ်ကို ပထမဆုံး မြင်ရပါပြီ' },
  { lang: 'ar', theme: 'dark', width: 430, text: 'منشوري الجديد يظهر أولاً في الصفحة الرئيسية' },
  { lang: 'en', theme: 'dark', width: 1280, text: 'Desktop check with a very long word: ' + 'x'.repeat(120) }
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of CASES) {
    const label = `${c.lang}/${c.theme}/${c.width}px`;
    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
      localStorage.setItem('theme', theme); localStorage.setItem('lang', lang);
    }, [aliceToken, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));

    // Start from Home, then post through the real composer.
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    await page.locator('.post-composer-trigger').click();
    await page.waitForURL(`${WEB}/create-post`);
    await page.locator('textarea').first().fill(c.text);
    const started = Date.now();
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${WEB}/`);
    const first = page.locator('article.post-card').first();
    await first.waitFor();
    const ms = Date.now() - started;
    const firstText = await first.innerText();
    check(`${label}: new post is the first card on Home`, firstText.includes(c.text.slice(0, 30)), `${ms} ms`);
    check(`${label}: it is shown as alice's own post`, firstText.includes('alice'));
    check(`${label}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${label}: no horizontal scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
    // Own post -> owner menu (edit/delete), not the report/block menu.
    await first.locator('.post-card-header button').last().click();
    const menu = await page.locator('[role="menu"]').innerText().catch(() => '');
    check(`${label}: own post has the owner menu`, menu.length > 0 && !/report|block|تبليغ|حظر|တိုင်ကြား|ပိတ်/i.test(menu), menu.replace(/\s+/g, ' ').slice(0, 80));
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(SP, `day2-own-post-${c.lang}-${c.theme}-${c.width}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
