// Day 40: a hashtag page's Top / Recent tabs (headless Edge, throwaway
// stack: alice(1), bob(2); carol is signed up here). Bob posts two #chai
// posts; the older one gets likes and a comment, so Top puts it first
// while Recent puts the newer one first. Tabs: URL (?sort=), reload,
// keyboard, dark and Arabic (RTL), no sideways page scroll at 375px.
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
  const alice = { id: 1, token: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim() };
  const bob = { id: 2, token: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
  const creds = { username: 'carol', email: 'carol@example.com', password: 'a-fine-password-123' };
  await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
  const carol = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: creds.email, password: creds.password }) }).then((r) => r.json());

  const as = (user) => ({ Authorization: `Bearer ${user.token}` });
  const post = async (user, content) => {
    const body = new FormData();
    body.append('content', content);
    return fetch(`${API}/posts`, { method: 'POST', headers: as(user), body }).then((r) => r.json());
  };
  const loved = await post(bob, 'Loved chai post #chai');
  await post(bob, 'Quiet newer post #chai');
  for (const user of [alice, carol]) await fetch(`${API}/posts/${loved.id}/like`, { method: 'POST', headers: as(user) });
  await fetch(`${API}/posts/${loved.id}/comments`, { method: 'POST', headers: { ...as(carol), 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'So good' }) });

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(([t, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [alice.token, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const texts = (page) => page.locator('#hashtag-panel .post-card-body').allInnerTexts();
  const firstText = async (page) => {
    await page.locator('#hashtag-panel .post-card-body').first().waitFor({ timeout: 10000 }).catch(() => {});
    return (await texts(page)).map((s) => s.trim());
  };

  // Tapping the hashtag in a post opens the tag page on Top.
  const p = await open(`/posts/${loved.id}`);
  await p.locator('a.post-text-hashtag', { hasText: '#chai' }).first().click();
  await p.waitForURL(`${WEB}/hashtag/chai`);
  const top = await firstText(p);
  check('a post\'s #chai link opens the tag page on Top', (await p.getByRole('tab', { name: 'Top' }).getAttribute('aria-selected')) === 'true');
  check('Top: the liked and commented post comes first', top[0]?.startsWith('Loved chai post') && top.length === 2, JSON.stringify(top));

  await p.getByRole('tab', { name: 'Recent' }).click();
  await p.waitForURL(`${WEB}/hashtag/chai?sort=recent`);
  await p.waitForTimeout(400);
  const recent = await firstText(p);
  check('Recent: the newest post comes first; the tab is in the URL', recent[0]?.startsWith('Quiet newer post') && recent.length === 2, JSON.stringify(recent));
  await p.reload({ waitUntil: 'networkidle' });
  check('a reload keeps Recent', (await p.getByRole('tab', { name: 'Recent' }).getAttribute('aria-selected')) === 'true' && (await firstText(p))[0]?.startsWith('Quiet newer post'));

  // Keyboard: arrows move between tabs and load them.
  await p.getByRole('tab', { name: 'Recent' }).focus();
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(400);
  const focused = await p.evaluate(() => document.activeElement?.textContent);
  check('arrow keys switch tabs (focus follows)', focused === 'Top' && (await firstText(p))[0]?.startsWith('Loved chai post'), focused);

  // Dark at 375px and Arabic (RTL).
  for (const [theme, lang, label] of [['dark', 'en', 'Top'], ['light', 'ar', 'الأبرز']]) {
    const q = await open('/hashtag/chai', { theme, lang, width: 375 });
    await firstText(q);
    const tab = q.getByRole('tab', { name: label });
    const selected = (await tab.getAttribute('aria-selected')) === 'true';
    const tabs = await q.locator('[role="tab"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
    // In RTL the first tab (Top) sits on the right.
    const order = lang === 'ar' ? tabs[0] > tabs[1] : tabs[0] < tabs[1];
    const noScroll = await q.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    check(`${theme}/${lang} 375px: Top selected, tabs in reading order, no sideways scroll`, selected && order && noScroll, JSON.stringify({ selected, tabs, noScroll }));
    await q.screenshot({ path: path.join(SP, `day40-hashtag-top-${theme}-${lang}.png`) });
    await q.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
