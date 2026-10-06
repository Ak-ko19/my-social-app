// Day 31: reacting to messages, two people live in one chat (headless
// Edge, throwaway stack: alice(1), bob(2)). Alice reacts to bob's message
// from the bubble's React button; bob sees it at once without reloading;
// changing and removing work; the keyboard path works; an unsent message
// can't be reacted to; dark mode and Arabic (RTL) at phone width.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const ids = { alice: 1, bob: 2 };
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const json = (who) => ({ Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/json' });

(async () => {
  const conv = await fetch(`${API}/conversations`, { method: 'POST', headers: json('alice'), body: JSON.stringify({ userId: ids.bob }) }).then((r) => r.json());
  const send = (who, content) => fetch(`${API}/conversations/${conv.id}/messages`, { method: 'POST', headers: json(who), body: JSON.stringify({ content }) }).then((r) => r.json());
  const bobMsg = await send('bob', 'Tea at six?');
  const aliceMsg = await send('alice', 'Sounds good');
  const doomed = await send('bob', 'oops wrong chat');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], ids[who], who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await page.goto(`${WEB}/messages/${conv.id}`, { waitUntil: 'networkidle' });
    await page.getByText('Tea at six?').waitFor({ timeout: 10000 });
    return page;
  };
  const row = (page, text) => page.locator('.messages-bubble-row', { hasText: text });
  const chipLabel = async (page, text) => (await row(page, text).locator('.messages-reactions').count())
    ? row(page, text).locator('.messages-reactions').getAttribute('aria-label') : null;

  const alice = await open('alice');
  const bob = await open('bob');
  await bob.waitForTimeout(500); // socket joined

  // 1. React from the bubble.
  await row(alice, 'Tea at six?').getByRole('button', { name: 'React', exact: true }).click();
  const picker = alice.getByRole('group', { name: 'Choose a reaction' });
  check('React opens a picker with the six reactions', (await picker.getByRole('button').count()) === 6);
  await picker.getByRole('button', { name: 'Love' }).click();
  check('the picker closes after picking', (await picker.count()) === 0);
  await alice.waitForTimeout(300);
  check('alice sees her reaction on the message', (await chipLabel(alice, 'Tea at six?'))?.includes('Love: You'), await chipLabel(alice, 'Tea at six?'));
  await row(bob, 'Tea at six?').locator('.messages-reactions').waitFor({ timeout: 5000 }).catch(() => {});
  check('bob sees it live, without reloading', (await chipLabel(bob, 'Tea at six?'))?.includes('Love: alice'), await chipLabel(bob, 'Tea at six?'));

  // 2. Change it, then remove it (picking it again).
  await row(alice, 'Tea at six?').getByRole('button', { name: 'React', exact: true }).click();
  check('her current reaction is marked in the picker', (await alice.getByRole('button', { name: 'Love', pressed: true }).count()) === 1);
  await alice.getByRole('group', { name: 'Choose a reaction' }).getByRole('button', { name: 'Haha' }).click();
  await bob.waitForTimeout(600);
  check('changing it updates both sides', (await chipLabel(alice, 'Tea at six?'))?.includes('Haha: You') && (await chipLabel(bob, 'Tea at six?'))?.includes('Haha: alice'));
  await row(alice, 'Tea at six?').locator('.messages-reactions').click(); // the pill opens the picker too
  await alice.getByRole('group', { name: 'Choose a reaction' }).getByRole('button', { name: 'Haha' }).click();
  await bob.waitForTimeout(600);
  check('picking it again removes it, for both', (await chipLabel(alice, 'Tea at six?')) === null && (await chipLabel(bob, 'Tea at six?')) === null);

  // 3. Both react to one message: total and both names.
  await row(bob, 'Sounds good').getByRole('button', { name: 'React', exact: true }).click();
  await bob.getByRole('group', { name: 'Choose a reaction' }).getByRole('button', { name: 'Like' }).click();
  await alice.waitForTimeout(500);
  await row(alice, 'Sounds good').getByRole('button', { name: 'React', exact: true }).click();
  await alice.getByRole('group', { name: 'Choose a reaction' }).getByRole('button', { name: 'Like' }).click();
  await bob.waitForTimeout(600);
  const both = await chipLabel(bob, 'Sounds good');
  check('two reactions: the pill shows 2 and names both', both?.includes('Like: You, alice') || both?.includes('Like: alice, You'), both);
  check('...and the count', (await row(bob, 'Sounds good').locator('.messages-reactions-count').textContent()) === '2');

  // 4. Keyboard only: open, move with arrows, pick with Enter, Escape closes.
  const reactBtn = row(alice, 'Tea at six?').getByRole('button', { name: 'React', exact: true });
  await reactBtn.focus();
  await alice.keyboard.press('Enter');
  await alice.keyboard.press('ArrowRight');
  await alice.keyboard.press('ArrowRight');
  await alice.keyboard.press('Enter');
  await alice.waitForTimeout(400);
  check('keyboard: Enter, two arrows, Enter = Haha', (await chipLabel(alice, 'Tea at six?'))?.includes('Haha: You'), await chipLabel(alice, 'Tea at six?'));
  await reactBtn.focus();
  await alice.keyboard.press('Enter');
  await alice.keyboard.press('Escape');
  check('Escape closes the picker and focus returns to React', (await alice.getByRole('group', { name: 'Choose a reaction' }).count()) === 0
    && (await alice.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'React');

  // 5. An unsent message has no React button (and the API refuses it).
  await fetch(`${API}/conversations/${conv.id}/messages/${doomed.id}`, { method: 'DELETE', headers: json('bob') });
  await alice.reload({ waitUntil: 'networkidle' });
  await alice.getByText('Tea at six?').waitFor();
  const deletedRow = alice.locator('.messages-bubble-row').last();
  check('an unsent message offers no React button', (await deletedRow.getByRole('button', { name: 'React', exact: true }).count()) === 0);
  const refused = await fetch(`${API}/conversations/${conv.id}/messages/${doomed.id}/reaction`, { method: 'PUT', headers: json('alice'), body: JSON.stringify({ reaction: 'like' }) });
  check('...and the API refuses it (409)', refused.status === 409);
  check('reactions survive a reload', (await chipLabel(alice, 'Tea at six?'))?.includes('Haha: You'));

  // 6. Dark mode and Arabic: pill and picker inside the screen, RTL.
  for (const [theme, lang, react, choose] of [['dark', 'en', 'React', 'Choose a reaction'], ['light', 'ar', 'تفاعل', null]]) {
    const p = await open('alice', { theme, lang });
    await row(p, 'Tea at six?').getByRole('button', { name: react, exact: true }).click();
    const pick = p.locator('.messages-reaction-picker');
    await pick.waitFor({ timeout: 5000 });
    const box = await pick.boundingBox();
    const chip = await row(p, 'Sounds good').locator('.messages-reactions').boundingBox();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: picker and pill fit the screen, no sideways scroll`, box && box.x >= 0 && box.x + box.width <= 390 && chip && chip.x >= 0 && chip.x + chip.width <= 390 && !overflow, JSON.stringify({ box, chip }));
    if (choose) check('dark: picker is labelled', (await p.getByRole('group', { name: choose }).count()) === 1);
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day31-reactions-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
