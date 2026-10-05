// B16: Arabic + right-to-left, end to end in headless Edge.
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
  const watch = (p) => { p.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text()); }); p.on('pageerror', (e) => errors.push(e.message)); return p; };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([t]) => {
    if (!localStorage.getItem('token')) {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
    }
  }, [aliceToken]);
  const p = watch(await ctx.newPage());

  // Switch from Settings.
  await p.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  const options = await p.locator('.language-option').allInnerTexts();
  check('Language screen offers EN / MY / AR', options.map((o) => o.trim()).join('|') === 'English|မြန်မာ|العربية', options.join('|'));
  await p.getByText('العربية').click();
  await p.getByRole('heading', { name: 'اللغة' }).waitFor();
  const html = await p.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
  check('choosing Arabic sets <html dir="rtl" lang="ar">', html.dir === 'rtl' && html.lang === 'ar', JSON.stringify(html));
  await p.reload({ waitUntil: 'networkidle' });
  check('Arabic + RTL persist across reload', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');

  // Mirrored layout.
  await p.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await p.locator('article.post-card').first().waitFor();
  const tabs = await p.locator('.bottom-tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  check('tab bar mirrored (Home is the right-most tab)', tabs[0] > tabs[tabs.length - 1], tabs.join(','));
  const tabLabel = await p.locator('.bottom-tab-label').first().innerText();
  check('tab labels in Arabic', tabLabel === 'الرئيسية', tabLabel);
  const post = p.locator('article.post-card').first();
  const postDir = await post.locator('.post-card-body').evaluate((el) => getComputedStyle(el).direction);
  check('English post keeps left-to-right inside the Arabic UI (dir=auto)', postDir === 'ltr', postDir);
  const hashtag = await post.locator('.post-text-hashtag bdi').count();
  check('hashtags isolated with <bdi>', hashtag === 1);

  await p.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  const backTransform = await p.locator('.settings-header svg').first().evaluate((el) => getComputedStyle(el).transform);
  check('back arrow mirrored', backTransform === 'matrix(-1, 0, 0, 1, 0, 0)', backTransform);
  const handle = await p.locator('.profile-summary-tagline bdi').innerText();
  check('handle reads "@alice" (isolated)', handle === '@alice', handle);

  // Chat: my bubble sits on the left in RTL.
  await p.goto(`${WEB}/messages/1`, { waitUntil: 'networkidle' });
  const input = p.locator('#message-composer-input');
  await input.fill('مرحبا من الاختبار');
  await p.getByRole('button', { name: 'إرسال', exact: true }).click();
  const bubble = p.locator('.messages-bubble-own', { hasText: 'مرحبا من الاختبار' });
  await bubble.waitFor();
  const box = await bubble.boundingBox();
  check('own chat bubble is on the left in RTL', box.x + box.width / 2 < 390 / 2, `center=${Math.round(box.x + box.width / 2)}`);
  const composerOrder = await p.evaluate(() => {
    const input = document.querySelector('#message-composer-input').getBoundingClientRect();
    const send = [...document.querySelectorAll('.messages-composer button[type="submit"]')][0].getBoundingClientRect();
    return send.left < input.left;
  });
  check('send button mirrored to the left of the input', composerOrder);

  // RTL arrow keys in tabs: ArrowLeft moves forward.
  await p.goto(`${WEB}/profile/1`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'المنشورات' }).focus();
  await p.keyboard.press('ArrowLeft');
  const selected = await p.getByRole('tab', { selected: true }).innerText();
  check('ArrowLeft selects the next tab in RTL', selected.trim() === 'الصور', selected);

  // Legal page date in Arabic (Western digits).
  await p.goto(`${WEB}/privacy`, { waitUntil: 'networkidle' });
  const updated = await p.locator('.legal-updated').innerText();
  check('dates in Arabic', updated.includes('5 أكتوبر 2026'), updated); // privacy policy date since Day 28
  check('Arabic font available', await p.evaluate(() => document.fonts.check('16px "Noto Sans Arabic"', 'مرحبا')));
  await p.screenshot({ path: path.join(SP, 'b16-privacy-ar.png') });

  // Server error message in Arabic.
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await anon.addInitScript(() => localStorage.setItem('lang', 'ar'));
  const lp = watch(await anon.newPage());
  await lp.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await lp.getByLabel('البريد الإلكتروني').fill('alice@example.com');
  await lp.getByLabel('كلمة المرور').fill('wrong-password-123');
  await lp.getByRole('button', { name: 'تسجيل الدخول' }).click();
  const alertText = await lp.getByRole('alert').innerText();
  check('server error shown in Arabic', alertText.includes('البريد الإلكتروني أو كلمة المرور غير صحيحة'), alertText);
  await anon.close();

  // And back to English: LTR again.
  await p.goto(`${WEB}/settings/language`, { waitUntil: 'networkidle' });
  await p.getByText('English').click();
  await p.getByRole('heading', { name: 'Language' }).waitFor();
  const back = await p.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
  check('switching back to English restores LTR', back.dir === 'ltr' && back.lang === 'en', JSON.stringify(back));

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
