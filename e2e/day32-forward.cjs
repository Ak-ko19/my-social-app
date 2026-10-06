// Day 32: forwarding a message, live (headless Edge, throwaway stack:
// alice(1), bob(2); carol is signed up here). Alice forwards bob's message
// from their chat to her chat with carol and to a group; carol sees it at
// once, labelled "Forwarded" and from alice; a chat that refuses (carol
// blocked alice) is named while the rest still go; dark and Arabic (RTL).
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  const users = {
    alice: { id: 1, token: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim() },
    bob: { id: 2, token: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() }
  };
  const creds = { username: 'carol', email: 'carol@example.com', password: 'a-fine-password-123' };
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
  const carolLogin = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: creds.email, password: creds.password }) }).then((r) => r.json());
  users.carol = { id: carolLogin.id, token: carolLogin.token };
  const json = (who) => ({ Authorization: `Bearer ${users[who].token}`, 'Content-Type': 'application/json' });
  const post = (who, url, body) => fetch(API + url, { method: 'POST', headers: json(who), body: JSON.stringify(body) }).then((r) => r.json());

  const fromBob = await post('alice', '/conversations', { userId: users.bob.id });
  const withCarol = await post('alice', '/conversations', { userId: users.carol.id });
  const group = await post('alice', '/conversations/groups', { name: 'Hikers', userIds: [users.carol.id] });
  await post('alice', `/conversations/${withCarol.id}/messages`, { content: 'hi carol' });
  await post('alice', `/conversations/${group.id}/messages`, { content: 'welcome hikers' });
  await post('bob', `/conversations/${fromBob.id}/messages`, { content: 'Saturday hike at 7, bring water' });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, convId, { theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [users[who].token, users[who].id, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/403|Forbidden/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
    await page.goto(`${WEB}/messages/${convId}`, { waitUntil: 'networkidle' });
    return page;
  };
  const row = (page, text) => page.locator('.messages-bubble-row', { hasText: text });

  const alice = await open('alice', fromBob.id);
  await alice.getByText('Saturday hike at 7').waitFor({ timeout: 10000 });
  const carol = await open('carol', withCarol.id);
  await carol.getByText('hi carol').waitFor({ timeout: 10000 });
  await carol.waitForTimeout(500);

  // 1. Forward from the bubble to a DM and a group.
  await row(alice, 'Saturday hike at 7').getByRole('button', { name: 'Forward', exact: true }).click();
  const sheet = alice.getByRole('dialog', { name: 'Forward to' });
  await sheet.getByRole('checkbox', { name: 'carol' }).waitFor({ timeout: 8000 });
  check('the sheet lists your chats (DM and group)', (await sheet.getByRole('checkbox', { name: 'carol' }).count()) === 1 && (await sheet.getByRole('checkbox', { name: 'Hikers' }).count()) === 1);
  await sheet.getByRole('searchbox', { name: 'Search chats' }).fill('hik');
  check('search narrows the list', (await sheet.getByRole('checkbox').count()) === 1);
  await sheet.getByRole('checkbox', { name: 'Hikers' }).check();
  await sheet.getByRole('searchbox', { name: 'Search chats' }).fill('');
  await sheet.getByRole('checkbox', { name: 'carol' }).check();
  await sheet.getByRole('button', { name: 'Send (2)' }).click();
  await alice.getByRole('status').filter({ hasText: 'Forwarded to 2 chats' }).waitFor({ timeout: 8000 }).catch(() => {});
  check('alice is told "Forwarded to 2 chats" and the sheet closes', (await alice.getByText('Forwarded to 2 chats').count()) === 1 && (await sheet.count()) === 0);

  // 2. Carol sees it live in her chat with alice, labelled, from alice.
  await row(carol, 'Saturday hike at 7').waitFor({ timeout: 8000 }).catch(() => {});
  const carolRow = row(carol, 'Saturday hike at 7');
  check('carol gets it at once, without reloading', (await carolRow.count()) === 1);
  check('...labelled "Forwarded"', (await carolRow.getByText('Forwarded', { exact: true }).count()) === 1);
  check('...as alice\'s message (not carol\'s own), nothing naming bob', !(await carolRow.getAttribute('class')).includes('own') && !(await carolRow.innerText()).includes('bob'));
  const groupMsgs = await fetch(`${API}/conversations/${group.id}/messages`, { headers: json('carol') }).then((r) => r.json());
  check('the group got it too', groupMsgs.messages.some((m) => m.content === 'Saturday hike at 7, bring water' && m.is_forwarded));
  check('the original in alice\'s chat with bob is not labelled', (await row(alice, 'Saturday hike at 7').getByText('Forwarded', { exact: true }).count()) === 0);

  // 3. A refusing chat is named; the other still goes.
  await fetch(`${API}/users/${users.alice.id}/block`, { method: 'POST', headers: json('carol') });
  await row(alice, 'Saturday hike at 7').getByRole('button', { name: 'Forward', exact: true }).click();
  await sheet.getByRole('checkbox', { name: 'carol' }).waitFor({ timeout: 8000 });
  await sheet.getByRole('checkbox', { name: 'carol' }).check();
  await sheet.getByRole('checkbox', { name: 'Hikers' }).check();
  await sheet.getByRole('button', { name: 'Send (2)' }).click();
  await sheet.getByRole('alert').waitFor({ timeout: 8000 }).catch(() => {});
  check('a refused chat is named and the sheet stays open', (await sheet.getByRole('alert').textContent())?.includes("Couldn't forward to: carol"));
  check('...only the refused one stays ticked', (await sheet.getByRole('checkbox', { name: 'carol' }).isChecked()) && !(await sheet.getByRole('checkbox', { name: 'Hikers' }).isChecked()));
  await alice.keyboard.press('Escape');
  check('Escape closes the sheet', (await sheet.count()) === 0);
  await fetch(`${API}/users/${users.alice.id}/block`, { method: 'DELETE', headers: json('carol') });

  // 4. Dark and Arabic: the sheet fits a phone; RTL.
  for (const [theme, lang, forward, title] of [['dark', 'en', 'Forward', 'Forward to'], ['light', 'ar', 'إعادة توجيه', 'إعادة التوجيه إلى']]) {
    const p = await open('alice', fromBob.id, { theme, lang });
    await row(p, 'Saturday hike at 7').first().getByRole('button', { name: forward, exact: true }).click();
    const s = p.getByRole('dialog', { name: title });
    await s.getByRole('checkbox').first().waitFor({ timeout: 8000 });
    await p.waitForTimeout(500); // the sheet's slide-in
    const box = await s.boundingBox();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`${theme}/${lang}: the sheet fits the screen, no sideways scroll`, box && box.x >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845 && !overflow, JSON.stringify(box));
    if (lang === 'ar') check('Arabic page is right-to-left', (await p.evaluate(() => document.documentElement.dir)) === 'rtl');
    await p.screenshot({ path: path.join(SP, `day32-forward-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
