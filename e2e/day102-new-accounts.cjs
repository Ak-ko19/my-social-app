// Day 102: new-account safety (a stack with SPAM_CHECKS_IN_TESTS=1). Nia
// signed up today. After 3 posts in a few minutes, the composer says new
// accounts can only post a few times and keeps her text; after following
// 20 people, the 21st Follow says why; after writing to 5 people who don't
// follow her, a 6th chat's message fails and the bubble says why (and
// nothing is saved). An older account isn't held back. EN/light 390 px
// and AR/dark 375 px (RTL), axe on the composer and the chat.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');
const EN = require('../frontend/src/i18n/locales/en.json');
const AR = require('../frontend/src/i18n/locales/ar.json');
const { pathToFileURL } = require('url');

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
// The refusals themselves (a 429 in the console) are expected here.
const EXPECTED = /status of 429|status code 429|AxiosError|send_message failed/;

// The server's English sentence, or its Arabic line from serverMessages.ar.js.
const NEW_POSTING = 'New accounts can only post a few times in a short while. Please wait a few minutes and try again.';
const NEW_FOLLOWS = 'New accounts can follow up to 20 people an hour. Please try again later.';
const NEW_STRANGERS = "New accounts can message up to 5 people who don't follow them in their first day. Please try again tomorrow.";
let AR_SERVER = {};
const inLang = (text, lang) => (lang === 'en' ? text : AR_SERVER[text] || text);

async function account(name, { old = false } = {}) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  if (old) sql(`UPDATE users SET created_at = now() - interval '2 days' WHERE id = ${me.id}`);
  return me;
}
const call = async (user, method, url, body) =>
  fetch(`${API}${url}`, { method, headers: { ...as(user), ...json }, body: body && JSON.stringify(body) });
async function post(user, content) {
  const form = new FormData();
  form.append('content', content);
  return fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form });
}
async function axeOf(page, label) {
  await page.waitForTimeout(500);
  await page.addScriptTag({ content: AXE });
  const bad = (await page.evaluate(() => window.axe.run(document.querySelector('.screen-enter') || document.body))).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
}

(async () => {
  AR_SERVER = (await import(pathToFileURL(path.join(__dirname, '..', 'frontend', 'src', 'i18n', 'serverMessages.ar.js')).href)).default.exact;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const nia = await account(`nia102${c.lang}`);
    const olu = await account(`olu102${c.lang}`, { old: true });

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [nia.token, nia.id, nia.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));

    // ---- Posting ----
    for (const n of [1, 2, 3]) await post(nia, `Hello world ${n}`);
    await page.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
    const box = page.getByRole('textbox', { name: c.L.compose.postLabel, exact: true });
    await box.fill('My fourth post today');
    await page.getByRole('button', { name: c.L.compose.post, exact: true }).click();
    const postReason = page.getByText(inLang(NEW_POSTING, c.lang), { exact: true });
    check(`${tag}: a 4th post in minutes: the composer says new accounts post a few times`, await shows(postReason));
    check(`${tag}: ...keeps her text, saves nothing`, (await box.inputValue()) === 'My fourth post today'
      && sql(`SELECT COUNT(*) FROM posts WHERE user_id = ${nia.id}`) === '3');
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    await axeOf(page, `${tag}: composer with the reason`);
    check(`${tag}: an older account posts a 4th time`, await (async () => {
      for (const n of [1, 2, 3]) await post(olu, `Older ${n}`);
      return (await post(olu, 'Older 4')).status === 201;
    })());

    // ---- Following ----
    const people = [];
    for (let i = 0; i < 21; i++) people.push(await account(`p${i}x102${c.lang}`, { old: true }));
    for (let i = 0; i < 20; i++) await call(nia, 'POST', `/users/${people[i].id}/follow`);
    await page.goto(`${WEB}/profile/${people[20].id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: c.L.follow.follow, exact: true }).first().click();
    check(`${tag}: the 21st follow in an hour says why`, await shows(page.getByText(inLang(NEW_FOLLOWS, c.lang), { exact: true })));
    check(`${tag}: ...and isn't saved`, sql(`SELECT COUNT(*) FROM follows WHERE follower_id = ${nia.id}`) === '20');

    // ---- Messages to strangers ----
    const strangers = [];
    for (let i = 0; i < 6; i++) strangers.push(await account(`s${i}x102${c.lang}`, { old: true }));
    const chats = [];
    for (const s of strangers) chats.push((await (await call(nia, 'POST', '/conversations', { userId: s.id })).json()).id);
    for (let i = 0; i < 5; i++) await call(nia, 'POST', `/conversations/${chats[i]}/messages`, { content: `Hi ${i}` });
    await page.goto(`${WEB}/messages/${chats[5]}`, { waitUntil: 'networkidle' });
    await shows(page.locator('.messages-thread'));
    await page.getByRole('textbox').last().fill('Hello there');
    await page.getByRole('button', { name: c.L.common.send, exact: true }).click();
    const failedReason = page.locator('.messages-failed-reason');
    check(`${tag}: a 6th stranger: the message fails and the bubble says why`, await shows(failedReason)
      && (await failedReason.innerText()) === inLang(NEW_STRANGERS, c.lang));
    check(`${tag}: ...with Retry, and nothing saved`, await shows(page.getByRole('button', { name: c.L.messages.sendFailed, exact: true }))
      && sql(`SELECT COUNT(*) FROM messages WHERE conversation_id = ${chats[5]}`) === '0');
    check(`${tag}: ...shown as sent text, not opened for editing`, (await page.locator('.messages-bubble-failed').getByRole('textbox').count()) === 0
      && (await page.locator('.messages-bubble-failed').innerText()).includes('Hello there'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await axeOf(page, `${tag}: chat with the refused message`);
    await page.screenshot({ path: path.join(SP, `day102-chat-${c.lang}-${c.theme}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
