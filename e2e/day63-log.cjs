// Day 63: Admin > Log (headless Edge, throwaway stack: alice(1) made an
// admin, bob(2), carol). carol posts, bob reports it; alice removes it from
// the Reports tab (a real click), then suspends carol through the API. The
// Log shows both as sentences, newest first, with the reason and the
// reports closed -- never the post's text. English light at 390px and
// Arabic dark at 375px: the five admin tabs fit, axe, no sideways scroll.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

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
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const strip = (s) => s.replace(/[⁨⁩]/g, '');

async function signup(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'a-fine-password-123' }) });
  return (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${name}@example.com`, password: 'a-fine-password-123' }) })).json();
}
const call = (method, url, token, body) => fetch(API + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });

(async () => {
  sql('UPDATE users SET is_admin = true WHERE id = 1');
  const carol = await signup('carol');
  const form = new FormData();
  form.append('content', 'LOGSECRET cheap pills here');
  const post = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${carol.token}` }, body: form })).json();
  await call('POST', '/reports', tokens.bob, { targetType: 'post', targetId: post.id, reason: 'spam' });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens.alice, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };

  // 1. A real removal from the Reports tab.
  const admin = await open('/admin?section=reports');
  const card = admin.locator('.admin-report', { hasText: 'LOGSECRET' });
  await card.waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Remove post' }).click();
  await card.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('removing it from Reports deleted the post', sql(`SELECT count(*) FROM posts WHERE id = ${post.id}`) === '0');
  await admin.context().close();

  // 2. A suspension, with a reason.
  await call('POST', `/admin/users/${carol.id}/suspend`, tokens.alice, { days: 3, reason: 'selling pills' });
  check('nothing of the post\'s text is kept in the log', sql("SELECT count(*) FROM admin_actions WHERE admin_actions::text LIKE '%LOGSECRET%'") === '0');

  for (const mode of [{ lang: 'en', theme: 'light', width: 390 }, { lang: 'ar', theme: 'dark', width: 375 }]) {
    const tag = `${mode.lang} ${mode.theme} ${mode.width}`;
    const L = (key) => key.split('.').reduce((o, k) => o?.[k], LOCALES[mode.lang]);
    const page = await open('/admin?section=log', mode);
    await page.locator('.admin-log-sentence').first().waitFor({ timeout: 10000 });
    const sentences = (await page.locator('.admin-log-sentence').allInnerTexts()).map(strip);
    const expected = mode.lang === 'en'
      ? ['alice suspended carol for 3 days', 'alice removed a post by carol']
      : ['علّق alice حساب carol لمدة 3 أيام', 'أزال alice منشورًا لـ carol'];
    check(`${tag} the log, newest first`, JSON.stringify(sentences) === JSON.stringify(expected), JSON.stringify(sentences));
    check(`${tag} the reason is shown`, (await page.getByText('selling pills').count()) === 1);
    check(`${tag} the Log tab is selected`, (await page.locator('.admin-sections [aria-selected="true"]').innerText()).trim() === L('admin.section.log'));
    // Each label on one line (a tab no taller than one line of text + padding).
    const tabs = await page.locator('.admin-sections').evaluate((el) => ({ fits: el.scrollWidth <= el.clientWidth + 1, overflow: [...el.children].some((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().height > 48) }));
    check(`${tag} the five admin tabs fit, none cut off`, tabs.fits && !tabs.overflow, JSON.stringify(tabs));
    check(`${tag} no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.waitForTimeout(400);
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${tag} axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
    await page.screenshot({ path: path.join(SP, `day63-log-${mode.lang}-${mode.theme}-${mode.width}.png`), fullPage: true });

    // One kind at a time.
    await page.getByLabel(L('admin.log.filterLabel')).selectOption('content_removed');
    await page.waitForFunction(() => document.querySelectorAll('.admin-log-sentence').length === 1, null, { timeout: 8000 }).catch(() => {});
    check(`${tag} "content removed" only: 1 entry`, (await page.locator('.admin-log-sentence').count()) === 1);
    await page.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
