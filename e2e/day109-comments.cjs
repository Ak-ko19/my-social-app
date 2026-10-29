// Days 109-110: comment upgrades. Pia's post has three comments: Liv's
// (liked twice, with 4 replies), then Max's, then Ned's. Opening them shows
// "Most relevant" chosen, Liv's first with 2 of its replies and "View 2
// more replies" (which brings the other two and goes). "Newest" puts Ned's
// first. A new comment goes to the top. axe on the comments. EN/light
// 390 px and AR/dark 375 px (RTL). Throwaway stack from e2e-up.sh.
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
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
const fill = (text, values) => Object.entries(values).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v), text);

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
const comment = async (user, postId, content, parentCommentId) => (await fetch(`${API}/posts/${postId}/comments`, {
  method: 'POST', headers: { ...as(user), ...json }, body: JSON.stringify({ content, parentCommentId })
})).json();

async function axe(page, tag, what) {
  await page.waitForTimeout(700);
  await page.addScriptTag({ content: AXE });
  const bad = (await page.evaluate(() => window.axe.run('.feed-comment-section'))).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`${tag}: ${what}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const C = c.L.comments;
    const [pia, liv, max, ned] = await Promise.all(['pia', 'liv', 'max', 'ned'].map((n) => account(`${n}109${c.lang}`)));
    const form = new FormData();
    form.append('content', `Which tea? (${c.lang})`);
    const post = await (await fetch(`${API}/posts`, { method: 'POST', headers: as(pia), body: form })).json();
    const top = await comment(liv, post.id, 'Green tea, always');
    for (const [i, who] of [[1, max], [2, ned], [3, pia], [4, max]]) await comment(who, post.id, `reply ${i}`, top.id);
    await comment(max, post.id, 'Milk tea');
    await comment(ned, post.id, 'Lemon tea');
    for (const fan of [max, ned]) await fetch(`${API}/comments/${top.id}/like`, { method: 'POST', headers: as(fan) });

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [pia.token, pia.id, pia.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    await page.goto(`${WEB}/posts/${post.id}`, { waitUntil: 'networkidle' });
    const card = page.locator('article.post-card').first();
    await card.getByRole('button', { name: c.L.feed.comment, exact: true }).click();
    const order = page.getByRole('radiogroup', { name: C.sortLabel });
    const threads = page.locator('.feed-comment-list > li');
    const firstWords = async () => (await threads.allInnerTexts()).map((t) => ['Green tea, always', 'Milk tea', 'Lemon tea', 'New one'].find((w) => t.includes(w)));
    check(`${tag}: comments open on "${C.sort.relevant}"`, await shows(order)
      && (await order.getByRole('radio', { name: C.sort.relevant, exact: true }).getAttribute('aria-checked')) === 'true');
    await threads.nth(2).waitFor();
    check(`${tag}: ...the liked one with replies first, then the newest`, JSON.stringify(await firstWords()) === JSON.stringify(['Green tea, always', 'Lemon tea', 'Milk tea']), JSON.stringify(await firstWords()));
    const liv1 = threads.nth(0);
    const replyCount = () => liv1.locator('.comment-replies > li').count();
    const moreLabel = c.lang === 'en' ? 'View 2 more replies' : C.moreReplies_two;
    check(`${tag}: ...it shows 2 of its 4 replies and "${moreLabel}"`, (await replyCount()) === 2 && await shows(liv1.getByRole('button', { name: moreLabel, exact: true })), String(await replyCount()));
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await axe(page, tag, 'comments, Most relevant');
    await page.locator('.feed-comment-section').screenshot({ path: path.join(SP, `day109-relevant-${c.lang}-${c.theme}.png`) });
    await liv1.getByRole('button', { name: moreLabel, exact: true }).click();
    await liv1.getByText('reply 4', { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
    check(`${tag}: "${moreLabel}" brings the other two, in order, and goes`, (await replyCount()) === 4
      && JSON.stringify((await liv1.locator('.comment-replies > li').allInnerTexts()).map((t) => (t.match(/reply \d/) || [''])[0])) === JSON.stringify(['reply 1', 'reply 2', 'reply 3', 'reply 4'])
      && (await liv1.getByRole('button', { name: moreLabel, exact: true }).count()) === 0);

    await order.getByRole('radio', { name: C.sort.newest, exact: true }).click();
    await page.waitForTimeout(300);
    await threads.nth(2).waitFor();
    check(`${tag}: "${C.sort.newest}" puts the newest first`, (await order.getByRole('radio', { name: C.sort.newest, exact: true }).getAttribute('aria-checked')) === 'true'
      && JSON.stringify(await firstWords()) === JSON.stringify(['Lemon tea', 'Milk tea', 'Green tea, always']), JSON.stringify(await firstWords()));

    await page.getByRole('textbox', { name: C.writeComment }).fill('New one');
    await page.getByRole('textbox', { name: C.writeComment }).press('Enter');
    await page.getByText('New one', { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
    check(`${tag}: a new comment goes to the top`, (await firstWords())[0] === 'New one', JSON.stringify(await firstWords()));
    await axe(page, tag, 'comments, Newest');
    await page.locator('.feed-comment-section').screenshot({ path: path.join(SP, `day109-newest-${c.lang}-${c.theme}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
