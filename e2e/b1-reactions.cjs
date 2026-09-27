// B1 reactions, end to end in headless Edge (throwaway stack from e2e-up.sh:
// alice follows bob; bob has one public post).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const token = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const serverReaction = async () => (await (await fetch(`${API}/posts/1`, { headers: { Authorization: `Bearer ${token}` } })).json());

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  async function newPage({ width = 390, touch = false, theme = 'light' } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(([t, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
      localStorage.setItem('theme', th);
    }, [token, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    return page;
  }
  const likeBtn = (page) => page.locator('.reaction-wrap > button.post-card-action').first();
  const stats = (page) => page.locator('.post-card-reaction-summary').first().innerText();

  // 1. Tap = like
  let page = await newPage();
  await likeBtn(page).click();
  await page.waitForTimeout(700);
  check('tap likes the post', (await likeBtn(page).getAttribute('aria-pressed')) === 'true' && (await stats(page)).includes('1 reaction'), await stats(page));
  check('server has like', (await serverReaction()).my_reaction === 'like');

  // 2. Hover opens picker; choose Love
  await likeBtn(page).hover();
  await page.waitForSelector('.reaction-picker', { timeout: 3000 });
  await page.getByRole('button', { name: 'Love', exact: true }).click();
  await page.waitForTimeout(700);
  check('hover picker -> Love', (await likeBtn(page).innerText()).includes('Love') && (await stats(page)).includes('❤️'), await likeBtn(page).innerText());
  const s1 = await serverReaction();
  check('server has love, still 1 reaction', s1.my_reaction === 'love' && s1.like_count === 1 && s1.reaction_counts.love === 1);
  check('picker closed after choosing', (await page.locator('.reaction-picker').count()) === 0);

  // 3. Persists across reload
  await page.reload({ waitUntil: 'networkidle' });
  check('reaction persists after reload', (await likeBtn(page).innerText()).includes('Love'));

  // 4. Keyboard: ArrowUp opens + focuses first; ArrowRight x2 -> Haha; Enter
  await page.mouse.move(0, 0);
  await likeBtn(page).focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForSelector('.reaction-picker');
  const focused1 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const focused2 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  check('keyboard: ArrowUp focuses Like, arrows move, Enter picks Haha', focused1 === 'Like' && focused2 === 'Haha' && (await serverReaction()).my_reaction === 'haha', `${focused1} -> ${focused2}`);
  const refocused = await page.evaluate(() => document.activeElement?.classList.contains('post-card-action'));
  check('focus returns to the Like button', refocused);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  check('Escape closes picker', (await page.locator('.reaction-picker').count()) === 0);

  // 5. Tap on an active reaction removes it
  await likeBtn(page).click();
  await page.waitForTimeout(700);
  const s2 = await serverReaction();
  check('tap removes reaction', s2.my_reaction === null && s2.like_count === 0 && (await stats(page)).trim() === '');
  await page.context().close();

  // 6. Touch long-press opens picker WITHOUT liking; picker fits at 375px (dark)
  page = await newPage({ width: 375, touch: true, theme: 'dark' });
  const btn = likeBtn(page);
  await btn.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(650);
  await btn.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
  await btn.dispatchEvent('click');
  await page.waitForTimeout(500);
  const pickerOpen = (await page.locator('.reaction-picker').count()) === 1;
  check('long-press opens picker', pickerOpen);
  check('long-press does not also like', (await serverReaction()).my_reaction === null);
  if (pickerOpen) {
    const box = await page.locator('.reaction-picker').boundingBox();
    check('picker fully on-screen at 375px', box.x >= 0 && box.x + box.width <= 375, `x=${Math.round(box.x)} w=${Math.round(box.width)}`);
    await page.screenshot({ path: path.join(SP, 'b1-picker-dark-375.png') });
    // tap outside closes
    await page.mouse.click(200, 30);
    await page.waitForTimeout(300);
    check('tap outside closes picker', (await page.locator('.reaction-picker').count()) === 0);
  }
  await browser.close();

  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
