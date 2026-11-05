// Day 112: the overlays Days 91-111 added, in all four combinations (EN and
// AR, light and dark). The feature suites check each in EN/light and AR/dark
// only, and only their own part of the page; this opens each one and runs
// axe on the whole page (WCAG 2.1 A/AA). Fin, who follows Ola, opens:
//   1. Ola's post with its comments open -- Most relevant, a pinned one,
//      "View 1 more reply" (Days 109-110);
//   2. the share sheet (Days 93-94) and 3. the post menu with "Pin" off
//      (it's not his post);
//   4. Ola's story with its reply box and reactions (Day 100);
//   5. their chat's search, with results (Day 99);
//   6. the notifications choice of a group he's in (Day 101).
// Throwaway stack from e2e-up.sh.
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
const IMG = `${WEB}/icon-512.png`;
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const shows = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim().replace(/\r/g, '');
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
const fill = (text, values) => Object.entries(values).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v), text);
const call = async (user, method, url, body) => (await fetch(`${API}${url}`, { method, headers: { ...as(user), ...json }, body: body ? JSON.stringify(body) : undefined })).json();

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}

// axe on the whole page, WCAG 2.1 A/AA (as day26-a11y), serious/critical.
async function axe(page, tag, what) {
  await page.waitForTimeout(700); // entrance animations
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`${tag}: ${what}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`).join(' || '));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const COMBOS = [['en', 'light', EN], ['en', 'dark', EN], ['ar', 'light', AR], ['ar', 'dark', AR]];
  for (const [lang, theme, L] of COMBOS) {
    const tag = `${lang}/${theme}`;
    const [ola, fin] = await Promise.all(['ola', 'fin'].map((n) => account(`${n}112${lang}${theme[0]}`)));
    await fetch(`${API}/users/${ola.id}/follow`, { method: 'POST', headers: as(fin) });
    await fetch(`${API}/users/${fin.id}/follow`, { method: 'POST', headers: as(ola) });
    // Ola's post: three comments by Fin, two replies to the first, the third pinned.
    const form = new FormData();
    form.append('content', `Which tea today? (${tag})`);
    const post = await (await fetch(`${API}/posts`, { method: 'POST', headers: as(ola), body: form })).json();
    const first = await call(fin, 'POST', `/posts/${post.id}/comments`, { content: 'Green tea' });
    await call(fin, 'POST', `/posts/${post.id}/comments`, { content: 'Milk tea' });
    const third = await call(fin, 'POST', `/posts/${post.id}/comments`, { content: 'Lemon tea' });
    for (const [i, who] of [[1, ola], [2, fin], [3, ola]]) await call(who, 'POST', `/posts/${post.id}/comments`, { content: `reply ${i}`, parentCommentId: first.id });
    await call(ola, 'PUT', `/posts/${post.id}/pinned-comment`, { commentId: third.id });
    // Her story, their chat, a group they're both in.
    sql(`INSERT INTO stories (user_id, media_url) VALUES (${ola.id}, '${IMG}')`);
    const chat = (await call(fin, 'POST', '/conversations', { userId: ola.id })).id;
    for (let i = 0; i < 6; i++) {
      sql(`INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES (${chat}, ${i % 2 ? ola.id : fin.id}, '${i === 2 ? 'See you at the tea house' : `Line ${i}`}', now() - interval '${10 - i} minutes')`);
    }
    const group = await call(ola, 'POST', '/communities', { name: `Tea friends ${tag}`, privacy: 'public' });
    await call(fin, 'POST', `/communities/${group.id}/join`);

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(([t, id, name, l, th]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', l); localStorage.setItem('theme', th);
    }, [fin.token, fin.id, fin.username, lang, theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    // 1. Comments open.
    await page.goto(`${WEB}/posts/${post.id}`, { waitUntil: 'networkidle' });
    const card = page.locator('article.post-card').first();
    await card.getByRole('button', { name: L.feed.comment, exact: true }).click();
    const comments = page.locator('.feed-comment-section');
    check(`${tag}: comments open, the pinned one first and "more replies" offered`, await shows(comments.getByText(L.comments.pinned, { exact: true }))
      && await shows(comments.locator('.comment-more-replies')));
    await axe(page, tag, 'comments open');
    if (lang === 'ar' && theme === 'light') await comments.screenshot({ path: path.join(SP, `day112-comments-${tag.replace('/', '-')}.png`) });

    // 2. The share sheet; 3. the post menu.
    await card.getByRole('button', { name: L.feed.share, exact: true }).click();
    check(`${tag}: the share sheet opens`, await shows(page.getByRole('menuitem', { name: L.feed.shareNow, exact: true })));
    await axe(page, tag, 'share sheet');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await card.getByRole('button', { name: L.postMenu.moreOptions, exact: true }).click();
    check(`${tag}: the post menu opens`, await shows(page.getByRole('menuitem').first()));
    await axe(page, tag, 'post menu');
    await page.keyboard.press('Escape');

    // 4. Her story, with the reply box.
    await page.goto(WEB, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: fill(L.stories.viewNew, { name: ola.username }), exact: true }).click();
    const viewer = page.getByRole('dialog', { name: fill(L.stories.label, { name: ola.username }) });
    check(`${tag}: her story opens, with a reply box`, await shows(viewer) && await shows(viewer.getByRole('textbox')));
    await axe(page, tag, 'story viewer');
    if (lang === 'ar' && theme === 'light') await page.screenshot({ path: path.join(SP, `day112-story-${tag.replace('/', '-')}.png`) });
    await page.keyboard.press('Escape');

    // 5. Search in their chat.
    await page.goto(`${WEB}/messages/${chat}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: L.messages.search.open, exact: true }).click();
    await page.getByRole('searchbox', { name: L.messages.search.placeholder }).fill('tea house');
    await page.getByRole('searchbox', { name: L.messages.search.placeholder }).press('Enter');
    check(`${tag}: chat search finds the message`, await shows(page.getByText('See you at the tea house').first()));
    await axe(page, tag, 'chat search');

    // 6. The group's notification choice.
    await page.goto(`${WEB}/groups/${group.id}`, { waitUntil: 'networkidle' });
    const P = L.postNotifications;
    await page.getByRole('button', { name: fill(P.button, { level: P.levels.highlights }), exact: true }).click();
    check(`${tag}: the group's notification choice opens`, await shows(page.getByRole('dialog', { name: fill(P.title, { name: group.name }) })));
    await axe(page, tag, 'group notification choice');
    if (lang === 'ar' && theme === 'light') await page.screenshot({ path: path.join(SP, `day112-bell-${tag.replace('/', '-')}.png`) });
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (lang === 'ar' ? 'rtl' : 'ltr'));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
