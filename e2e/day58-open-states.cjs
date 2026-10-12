// Day 58: open states (headless Edge, throwaway stack: alice(1), bob(2)).
// The resting-page audit (day26-a11y) never opens an overlay, so this one
// does: the post "More options" sheet, the Report dialog, the Save to
// collection sheet, the Delete confirm and the reaction picker -- in
// English light at 390px and Arabic dark at 375px. Each gets axe (nothing
// serious) and the keyboard rules: Tab and Shift+Tab stay inside a dialog,
// Escape closes it, and focus goes back to the button that opened it.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const LOCALES = {
  en: JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'en.json'), 'utf8')),
  ar: JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'))
};
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };

async function post(who, content) {
  const form = new FormData();
  form.append('content', content);
  return (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[who]}` }, body: form })).json();
}

(async () => {
  const bobPost = await post('bob', 'Tea leaf salad at the market');
  const alicePost = await post('alice', 'Morning walk by the lake');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const mode of [{ lang: 'en', theme: 'light', width: 390 }, { lang: 'ar', theme: 'dark', width: 375 }]) {
    const tag = `${mode.lang} ${mode.theme} ${mode.width}`;
    const L = (key) => key.split('.').reduce((o, k) => o?.[k], LOCALES[mode.lang]);
    const ctx = await browser.newContext({ viewport: { width: mode.width, height: 844 } });
    await ctx.addInitScript(([t, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens.alice, mode.theme, mode.lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });

    const axe = async (selector, label) => {
      await page.waitForTimeout(400); // the open animation
      await page.evaluate(AXE);
      const r = await page.evaluate((sel) => window.axe.run(document.querySelector(sel), {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
      }), selector);
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      check(`${tag} ${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
    };
    // The focused element's label (or text), to say where focus went.
    const focused = () => page.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40) : '';
    });
    // Tab and Shift+Tab, a dozen times: focus must never leave the dialog.
    const tabStaysInside = async (label) => {
      const outside = [];
      for (const [key, times] of [['Tab', 12], ['Shift+Tab', 6]]) {
        for (let i = 0; i < times; i += 1) {
          await page.keyboard.press(key);
          const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
          if (!inside) outside.push(`${key} #${i + 1}: ${await focused()}`);
        }
      }
      check(`${tag} ${label}: Tab and Shift+Tab stay inside`, outside.length === 0, outside.slice(0, 3).join('; '));
    };
    // Escape closes the dialog and focus is back on the button that opened it.
    const escapeReturns = async (label, openerLabel) => {
      await page.keyboard.press('Escape');
      await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
      check(`${tag} ${label}: Escape closes it`, (await page.locator('[role="dialog"]').count()) === 0);
      const now = await focused();
      check(`${tag} ${label}: focus goes back to "${openerLabel}"`, now === openerLabel, `focus is on "${now}"`);
    };
    const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    // 1. The "More options" sheet on bob's post.
    await page.goto(`${WEB}/posts/${bobPost.id}`, { waitUntil: 'networkidle' });
    const more = page.locator('article.post-card').first().getByRole('button', { name: L('postMenu.moreOptions') });
    await more.waitFor({ timeout: 10000 });
    await more.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menu').waitFor({ timeout: 8000 });
    check(`${tag} the sheet opens with focus inside it`, await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))));
    await axe('[role="dialog"]', 'More options sheet');
    check(`${tag} the sheet: no sideways scroll`, await noSideScroll());
    await tabStaysInside('More options sheet');
    await escapeReturns('More options sheet', L('postMenu.moreOptions'));

    // 2. Report, opened from the sheet.
    await more.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: L('postMenu.report') }).click();
    await page.getByRole('radiogroup').waitFor({ timeout: 8000 });
    await axe('[role="dialog"]', 'Report dialog');
    await tabStaysInside('Report dialog');
    await escapeReturns('Report dialog', L('postMenu.moreOptions'));

    // 3. Save to collection (a lazy sheet), opened from the sheet.
    await more.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: L('collections.menuItem') }).click();
    await page.locator('[role="dialog"] input').first().waitFor({ timeout: 8000 });
    await axe('[role="dialog"]', 'Save to collection sheet');
    await tabStaysInside('Save to collection sheet');
    await escapeReturns('Save to collection sheet', L('postMenu.moreOptions'));

    // 4. The reaction picker (a toolbar, not a dialog): ArrowUp opens it on
    // the first reaction, arrows move, Escape gives focus back to Like.
    const like = page.locator('article.post-card').first().locator('.reaction-wrap > button');
    await like.focus();
    const likeLabel = await like.getAttribute('aria-label');
    await page.keyboard.press('ArrowUp');
    await page.locator('.reaction-picker').waitFor({ timeout: 8000 });
    await page.waitForTimeout(100);
    const firstOption = await focused();
    check(`${tag} the reaction picker opens on the first reaction`, firstOption === L('reactions.like'), `focus is on "${firstOption}"`);
    await axe('.reaction-picker', 'reaction picker');
    await page.keyboard.press(mode.lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    const second = await focused();
    check(`${tag} the reading-direction arrow moves to the next reaction`, second === L('reactions.love'), `focus is on "${second}"`);
    await page.keyboard.press('Escape');
    await page.locator('.reaction-picker').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    check(`${tag} reaction picker: Escape closes it`, (await page.locator('.reaction-picker').count()) === 0);
    check(`${tag} reaction picker: focus goes back to Like`, (await focused()) === likeLabel, `focus is on "${await focused()}"`);

    // 5. Delete on alice's own post: the confirm dialog.
    await page.goto(`${WEB}/posts/${alicePost.id}`, { waitUntil: 'networkidle' });
    const mine = page.locator('article.post-card').first().getByRole('button', { name: L('postMenu.moreOptions') });
    await mine.waitFor({ timeout: 10000 });
    await mine.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: L('postMenu.delete') }).click();
    await page.getByRole('heading', { name: L('postMenu.deleteTitle') }).waitFor({ timeout: 8000 });
    await axe('[role="dialog"]', 'Delete confirm');
    check(`${tag} Delete confirm: no sideways scroll`, await noSideScroll());
    await tabStaysInside('Delete confirm');
    await escapeReturns('Delete confirm', L('postMenu.moreOptions'));
    check(`${tag} Escape deleted nothing`, (await fetch(`${API}/posts/${alicePost.id}`, { headers: { Authorization: `Bearer ${tokens.alice}` } })).status === 200);

    await ctx.close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
