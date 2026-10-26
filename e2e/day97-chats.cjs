// Days 97-98: pinned and archived chats. Ana has chats with four people.
// From each row's "More options" she pins Bob (he goes to the top, with a
// pin) and two more; a fourth pin is refused ("You can pin up to 3
// chats."). She archives Eve: Eve leaves the inbox and "Archived chats (1)"
// appears, which lists her. When Eve writes again, Eve is back in the inbox
// (live, from the archived screen) and the link is gone. axe on the inbox.
// EN/light 390 px and AR/dark 375 px (RTL). Throwaway stack from e2e-up.sh.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const EN = require('../frontend/src/i18n/locales/en.json');
const AR = require('../frontend/src/i18n/locales/ar.json');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const PASSWORD = 'a-fine-password-123';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const shows = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);
const gone = (locator, timeout = 10000) => locator.waitFor({ state: 'detached', timeout }).then(() => true, () => false);
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
async function chat(me, other, text) {
  const id = (await (await fetch(`${API}/conversations`, { method: 'POST', headers: { ...as(me), ...json }, body: JSON.stringify({ userId: other.id }) })).json()).id;
  await fetch(`${API}/conversations/${id}/messages`, { method: 'POST', headers: { ...as(other), ...json }, body: JSON.stringify({ content: text }) });
  return id;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const O = c.L.messages.organise;
    const ana = await account(`ana97${c.lang}`);
    const [bob, cal, dee, eve] = await Promise.all(['bob', 'cal', 'dee', 'eve'].map((n) => account(`${n}97${c.lang}`)));
    for (const [who, text] of [[bob, 'Hi from Bob'], [cal, 'Hi from Cal'], [dee, 'Hi from Dee'], [eve, 'Hi from Eve']]) {
      await chat(ana, who, text);
      await new Promise((r) => setTimeout(r, 50));
    }

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [ana.token, ana.id, ana.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    // The refused fourth pin (a 400, logged by the browser and the app) is
    // expected while `refusing`; nothing else may fail.
    let refusing = false;
    page.on('console', (m) => { if (m.type() === 'error' && !refusing) errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400 && !refusing) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
    const names = () => page.locator('.messages-name').allInnerTexts();
    const menu = (who) => page.getByRole('button', { name: O.options.replace('{{name}}', who.username), exact: true });
    const choose = async (who, label) => {
      await menu(who).click();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
    };
    await shows(menu(bob));
    check(`${tag}: newest first`, (await names())[0].startsWith(eve.username), JSON.stringify(await names()));

    await choose(bob, O.pin);
    check(`${tag}: a pinned chat goes to the top, with a pin`, await shows(page.locator('.messages-list-item', { hasText: bob.username }).getByRole('img', { name: O.pinnedLabel }))
      && (await names())[0].startsWith(bob.username), JSON.stringify(await names()));
    await choose(cal, O.pin);
    await page.locator('.messages-list-item', { hasText: cal.username }).getByRole('img', { name: O.pinnedLabel }).waitFor({ timeout: 8000 }).catch(() => {});
    await choose(dee, O.pin);
    await page.locator('.messages-list-item', { hasText: dee.username }).getByRole('img', { name: O.pinnedLabel }).waitFor({ timeout: 8000 }).catch(() => {});
    const order = await names();
    check(`${tag}: the most recently pinned first`, [dee, cal, bob].every((who, i) => order[i].startsWith(who.username)), JSON.stringify(order));
    refusing = true;
    await choose(eve, O.pin);
    const refused = c.lang === 'ar' ? 'يمكنك تثبيت 3 محادثات كحد أقصى.' : 'You can pin up to 3 chats.';
    check(`${tag}: a fourth pin is refused, in the app's language`, await shows(page.getByRole('alert').filter({ hasText: refused })));
    await page.waitForLoadState('networkidle');
    refusing = false;

    await page.waitForTimeout(700);
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(() => window.axe.run('.screen-body'));
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message || ''}`).join(' | ')}`);
    check(`${tag}: the inbox has no serious axe issues`, serious.length === 0, serious.join(', '));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.screenshot({ path: path.join(SP, `day97-chats-inbox-${c.lang}-${c.theme}.png`), fullPage: true });

    // Archive Eve.
    await choose(eve, O.archive);
    const link = page.getByRole('button', { name: O.archivedLink_one.replace('{{count}}', '1'), exact: true });
    check(`${tag}: archiving takes Eve off the inbox`, await gone(page.locator('.messages-list-item', { hasText: eve.username })));
    check(`${tag}: ..."Archived chats (1)" appears`, await shows(link));
    await link.click();
    check(`${tag}: it opens "Archived chats" with Eve`, await shows(page.getByRole('heading', { name: O.archivedTitle, exact: true }))
      && await shows(page.locator('.messages-list-item', { hasText: eve.username })));
    await page.screenshot({ path: path.join(SP, `day97-chats-archived-${c.lang}-${c.theme}.png`), fullPage: true });

    // Eve writes again: back to the inbox, live.
    const eveChat = Number(await page.evaluate(async ([api, token]) => {
      const res = await fetch(`${api}/conversations?archived=1`, { headers: { Authorization: `Bearer ${token}` } });
      return (await res.json()).conversations[0].conversation_id;
    }, [API, ana.token]));
    await fetch(`${API}/conversations/${eveChat}/messages`, { method: 'POST', headers: { ...as(eve), ...json }, body: JSON.stringify({ content: 'Are you there?' }) });
    check(`${tag}: a new message takes Eve out of the archive at once`, await gone(page.locator('.messages-list-item', { hasText: eve.username })));
    await page.getByRole('button', { name: O.backToMessages, exact: true }).click();
    check(`${tag}: ...and she is back in the inbox`, await shows(page.locator('.messages-list-item', { hasText: eve.username })));
    check(`${tag}: ...and the archive link is gone`, await gone(link));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
