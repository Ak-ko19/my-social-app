// Day 99: search inside a chat. Ana and Bob have 30 messages; two mention
// "tea house". In the chat, the Search button replaces the thread with a
// search box; "tea house" lists the two, newest first, the words marked.
// Tapping the older one shows the messages around it (that one highlighted,
// in view, the list reachable by keyboard); "Back to results", then "Back to the chat" shows the thread and
// the composer again. axe on the panel. EN/light 390 px and AR/dark 375 px
// (RTL). Throwaway stack from e2e-up.sh.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');
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
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const S = c.L.messages.search;
    const [ana, bob] = await Promise.all(['ana', 'bob'].map((n) => account(`${n}99${c.lang}`)));
    const chat = (await (await fetch(`${API}/conversations`, { method: 'POST', headers: { ...as(ana), ...json }, body: JSON.stringify({ userId: bob.id }) })).json()).id;
    // 30 messages, a minute apart (straight into the database: the send
    // limit is per chat); lines 8 and 22 mention the tea house.
    for (let i = 0; i < 30; i++) {
      const text = i === 8 ? 'Shall we meet at the Tea House?' : i === 22 ? 'The tea house was lovely' : `Line ${i}`;
      sql(`INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES (${chat}, ${i % 2 ? bob.id : ana.id}, '${text}', now() - interval '${30 - i} minutes')`);
    }

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [ana.token, ana.id, ana.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(`${WEB}/messages/${chat}`, { waitUntil: 'networkidle' });
    await shows(page.locator('.messages-thread'));
    await page.getByRole('button', { name: S.open, exact: true }).click();
    const box = page.getByRole('searchbox', { name: S.placeholder });
    check(`${tag}: Search opens a search box in place of the thread`, await shows(box) && !(await page.locator('.messages-thread').isVisible()));
    await box.fill('tea house');
    // Two: Arabic has a form of its own for two.
    const list = page.getByRole('list', { name: (c.lang === 'ar' ? S.results_two : S.results_other).replace('{{count}}', '2') });
    check(`${tag}: "tea house" finds the two messages`, await shows(list));
    const found = await list.locator('.chat-search-text').allInnerTexts();
    check(`${tag}: ...newest first`, found[0] === 'The tea house was lovely' && found[1] === 'Shall we meet at the Tea House?', JSON.stringify(found));
    check(`${tag}: ...with the words marked`, (await list.locator('mark').allInnerTexts()).join('|') === 'tea house|Tea House');
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.waitForTimeout(500);
    await page.addScriptTag({ content: AXE });
    const axeOf = async () => (await page.evaluate(() => window.axe.run('.chat-search'))).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    const panelAxe = await axeOf();
    check(`${tag}: the results have no serious axe issues`, panelAxe.length === 0, panelAxe.join(', '));
    await page.screenshot({ path: path.join(SP, `day99-chat-search-results-${c.lang}-${c.theme}.png`) });

    // The older one: the messages around it.
    await list.getByRole('button').nth(1).click();
    const around = page.getByRole('region', { name: S.contextTitle });
    check(`${tag}: a result shows the messages around it`, await shows(around));
    const current = around.locator('[aria-current="true"]');
    check(`${tag}: ...that one highlighted`, (await current.innerText()).includes('Shall we meet at the Tea House?'));
    const items = await around.locator('li').count();
    // It is message 8 of 30: the 8 before it (all there are) and 10 after.
    check(`${tag}: ...with what is before it (up to 10) and 10 after`, items === 19, String(items));
    const inView = await current.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const list = el.closest('ol').getBoundingClientRect();
      return box.top >= list.top && box.bottom <= list.bottom;
    });
    check(`${tag}: ...and in view`, inView);
    const contextAxe = await axeOf();
    check(`${tag}: the context has no serious axe issues`, contextAxe.length === 0, contextAxe.join(', '));
    await page.screenshot({ path: path.join(SP, `day99-chat-search-context-${c.lang}-${c.theme}.png`) });

    await page.getByRole('button', { name: S.backToResults, exact: true }).click();
    check(`${tag}: back to the same results`, (await box.inputValue()) === 'tea house' && await shows(list));
    await page.getByRole('button', { name: S.close, exact: true }).click();
    check(`${tag}: back to the chat: the thread and the composer again`, await shows(page.locator('.messages-thread'))
      && await page.locator('.messages-thread').isVisible() && await shows(page.getByRole('textbox').last()));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
