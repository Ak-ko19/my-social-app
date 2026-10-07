// Day 23: message notification settings -- the "Messages" switch and muting
// one chat (8 hours / 1 week / until turned back on). Throwaway stack:
// alice(1), bob(2), conversation 1. EN, AR (RTL).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  async function newPage({ lang = 'en', theme = 'light', width = 390 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [aliceToken, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${lang}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
    return page;
  }
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const mutedUntil = () => sql('SELECT muted_until FROM conversation_participants WHERE conversation_id = 1 AND user_id = 1');

  // 1. Mute the chat with bob for 8 hours from its header.
  const EN = locale('en');
  const page = await newPage();
  await page.goto(`${WEB}/messages/1`, { waitUntil: 'networkidle' });
  const bell = page.getByRole('button', { name: EN.messages.mute.open });
  await bell.waitFor({ timeout: 8000 }).catch(() => {});
  check('chat header has a "Mute notifications" button', (await bell.count()) === 1);
  await bell.click();
  const sheet = page.getByRole('dialog');
  check('it offers 8 hours, 1 week and until turned back on',
    (await sheet.getByRole('menuitem', { name: EN.messages.mute.for8h }).count()) === 1
    && (await sheet.getByRole('menuitem', { name: EN.messages.mute.for1w }).count()) === 1
    && (await sheet.getByRole('menuitem', { name: EN.messages.mute.always }).count()) === 1);
  await sheet.getByRole('menuitem', { name: EN.messages.mute.for8h }).click();
  await page.getByRole('button', { name: EN.messages.mute.mutedLabel }).waitFor({ timeout: 5000 }).catch(() => {});
  check('the bell shows it is muted', (await page.getByRole('button', { name: EN.messages.mute.mutedLabel }).count()) === 1);
  const until = sql("SELECT round(extract(epoch FROM muted_until - now()) / 3600) FROM conversation_participants WHERE conversation_id = 1 AND user_id = 1");
  check('server: muted for 8 hours', until === '8', until);
  check('bob\'s side is untouched', sql('SELECT muted_until IS NULL FROM conversation_participants WHERE conversation_id = 1 AND user_id = 2') === 't');

  // 2. The inbox marks it.
  await page.goto(`${WEB}/messages`, { waitUntil: 'networkidle' });
  check('inbox: the chat shows a muted icon', (await page.getByRole('img', { name: EN.messages.mute.mutedLabel }).count()) === 1);

  // 3. Unmute, then "until I turn them back on".
  await page.goto(`${WEB}/messages/1`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: EN.messages.mute.mutedLabel }).click();
  await page.getByRole('menuitem', { name: EN.messages.mute.unmute }).click();
  await page.getByRole('button', { name: EN.messages.mute.open }).waitFor({ timeout: 5000 }).catch(() => {});
  check('unmute -> server cleared it', mutedUntil() === '');
  await page.getByRole('button', { name: EN.messages.mute.open }).click();
  await page.getByRole('menuitem', { name: EN.messages.mute.always }).click();
  await page.waitForTimeout(600);
  check('"until I turn them back on" -> no end time (infinity)', mutedUntil() === 'infinity');

  // 4. The "Messages" switch in notification settings.
  await page.goto(`${WEB}/settings/notifications`, { waitUntil: 'networkidle' });
  const sw = page.getByRole('switch', { name: new RegExp(`^${EN.notifSettings.items.messages.title}`) });
  await sw.waitFor({ timeout: 8000 }).catch(() => {});
  check('settings: a "Messages" switch, on by default', (await sw.getAttribute('aria-checked')) === 'true');
  await sw.click();
  await page.waitForTimeout(600);
  check('turning it off is saved', sql('SELECT messages FROM notification_preferences WHERE user_id = 1') === 'f');
  await page.context().close();

  // 5. Arabic (RTL), and English at 375px dark: the header button and the sheet, translated, fit.
  for (const [lang, theme, width] of [['en', 'dark', 375], ['ar', 'dark', 430]]) {
    const L = locale(lang);
    const p = await newPage({ lang, theme, width });
    await p.goto(`${WEB}/messages/1`, { waitUntil: 'networkidle' });
    const btn = p.getByRole('button', { name: L.messages.mute.mutedLabel });
    await btn.waitFor({ timeout: 8000 }).catch(() => {});
    check(`${lang}: muted bell, translated`, (await btn.count()) === 1);
    await btn.click();
    check(`${lang}: sheet title translated`, (await p.getByText(L.messages.mute.mutedTitle).count()) >= 1);
    check(`${lang}: no horizontal scroll`, await noHScroll(p));
    await p.screenshot({ path: path.join(SP, `day23-mute-${lang}-${theme}-${width}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
