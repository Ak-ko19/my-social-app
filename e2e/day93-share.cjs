// Days 93-94: sharing a post. Ana posts two public posts. Bob opens the
// first and shares it with "Share now"; the second with "Write post" (his
// words, Followers only). Cal, who follows Bob, sees both shares on Home
// with Ana's posts inside; Ana's notifications say "bob shared your post"
// (one grouped row per post). When Ana makes the first post followers-only,
// Cal's card says "This content isn't available right now". A post that
// isn't open to everyone offers only Copy link. axe on the dialog and the
// cards. EN/light 390 px and AR/dark 375 px (RTL). Throwaway stack from
// e2e-up.sh.
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

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}
async function post(user, content, visibility = 'public') {
  const form = new FormData();
  form.append('content', content);
  form.append('visibility', visibility);
  return (await fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form })).json();
}
async function signedIn(browser, user, c) {
  const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
  await ctx.addInitScript(([t, id, name, lang, theme]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
    localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
  }, [user.token, user.id, user.username, c.lang, c.theme]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${c.lang} ${user.username}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${c.lang} ${user.username}: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${c.lang} ${user.username}: ${r.status()} ${r.request().method()} ${r.url()}`); });
  return { ctx, page };
}
async function axeSerious(page, selector) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate((sel) => window.axe.run(sel), selector);
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const F = c.L.feed;
    const [ana, bob, cal] = await Promise.all(['ana', 'bob', 'cal'].map((n) => account(`${n}93${c.lang}`)));
    await fetch(`${API}/users/${bob.id}/follow`, { method: 'POST', headers: as(cal) });
    const sunset = await post(ana, 'Sunset at Inle Lake');
    const market = await post(ana, 'The floating market at dawn');
    const secret = await post(ana, 'Just for my followers', 'followers');
    await fetch(`${API}/users/${ana.id}/follow`, { method: 'POST', headers: as(bob) });

    // Bob: Share now.
    const b = await signedIn(browser, bob, c);
    await b.page.goto(`${WEB}/posts/${sunset.id}`, { waitUntil: 'networkidle' });
    await b.page.getByRole('button', { name: F.share, exact: true }).click();
    const menu = b.page.getByRole('menu');
    await shows(menu);
    const offered = await menu.getByRole('menuitem').allInnerTexts();
    check(`${tag}: Share offers Share now, Write post, Copy link`, [F.shareNow, F.shareWrite, F.shareCopyLink].every((x) => offered.includes(x)), offered.join(' | '));
    await menu.getByRole('menuitem', { name: F.shareNow, exact: true }).click();
    check(`${tag}: "Share now" says Shared!`, await shows(b.page.getByText(F.shared, { exact: true })));
    check(`${tag}: ...and the post counts it`, await shows(b.page.locator('.post-card-stats', { hasText: F.shareCount_one.replace('{{count}}', '1') })));

    // Bob: Write post, his words, followers only.
    await b.page.goto(`${WEB}/posts/${market.id}`, { waitUntil: 'networkidle' });
    await b.page.getByRole('button', { name: F.share, exact: true }).click();
    await b.page.getByRole('menuitem', { name: F.shareWrite, exact: true }).click();
    const dialog = b.page.getByRole('dialog', { name: F.shareDialogTitle });
    check(`${tag}: Write post opens with the post inside`, await shows(dialog.getByText('The floating market at dawn')));
    await dialog.getByLabel(F.shareWordsLabel).fill('Going there next week!');
    await dialog.getByRole('radio', { name: c.L.compose.followers }).check();
    await b.page.waitForTimeout(700); // the dialog's entrance animation
    const dialogAxe = await axeSerious(b.page, '.share-dialog');
    check(`${tag}: the dialog has no serious axe issues`, dialogAxe.length === 0, dialogAxe.join(', '));
    await b.page.screenshot({ path: path.join(SP, `day93-share-dialog-${c.lang}-${c.theme}.png`) });
    await dialog.getByRole('button', { name: F.share, exact: true }).click();
    check(`${tag}: ...shared, and the dialog closes`, await shows(b.page.getByText(F.shared, { exact: true })) && await dialog.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false));

    // A post not open to everyone: only the link.
    await b.page.goto(`${WEB}/posts/${secret.id}`, { waitUntil: 'networkidle' });
    await b.page.getByRole('button', { name: F.share, exact: true }).click();
    const only = await b.page.getByRole('menu').getByRole('menuitem').allInnerTexts();
    check(`${tag}: a followers-only post offers only Copy link`, !only.includes(F.shareNow) && !only.includes(F.shareWrite) && only.includes(F.shareCopyLink), only.join(' | '));
    await b.ctx.close();

    // Cal: both shares on Home, Ana's posts inside, Bob's words.
    const k = await signedIn(browser, cal, c);
    await k.page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    const inside = (name) => k.page.getByRole('region', { name: F.sharedPostLabel.replace('{{name}}', name) });
    check(`${tag}: Home shows the shares with Ana's posts inside`, await shows(inside(ana.username).filter({ hasText: 'Sunset at Inle Lake' }))
      && await shows(inside(ana.username).filter({ hasText: 'The floating market at dawn' })));
    check(`${tag}: ...and Bob's words above`, await shows(k.page.getByText('Going there next week!')));
    check(`${tag}: html dir`, (await k.page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await k.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await k.page.waitForTimeout(700);
    const cardAxe = await axeSerious(k.page, '.post-card');
    check(`${tag}: the cards have no serious axe issues`, cardAxe.length === 0, cardAxe.join(', '));
    await k.page.screenshot({ path: path.join(SP, `day93-share-home-${c.lang}-${c.theme}.png`), fullPage: true });
    // Tapping the shared post's author line opens the original.
    await inside(ana.username).filter({ hasText: 'Sunset at Inle Lake' }).getByRole('link').click();
    await k.page.waitForURL((u) => u.pathname === `/posts/${sunset.id}`, { timeout: 8000 }).catch(() => {});
    check(`${tag}: the shared post opens the original`, k.page.url().endsWith(`/posts/${sunset.id}`), k.page.url());
    // Let that page finish loading first: its requests would rightly be 404s
    // once the post is followers-only.
    await k.page.waitForLoadState('networkidle');

    // Ana makes the first post followers-only: the share can't show it.
    await fetch(`${API}/posts/${sunset.id}`, { method: 'PUT', headers: { ...as(ana), ...json }, body: JSON.stringify({ visibility: 'followers' }) });
    await k.page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    check(`${tag}: then the share says it isn't available`, await shows(k.page.getByText(F.shareUnavailable, { exact: true })));
    check(`${tag}: ...and the other share still shows its post`, await shows(inside(ana.username).filter({ hasText: 'The floating market at dawn' })));
    await k.ctx.close();

    // Ana: told, one row per post.
    const a = await signedIn(browser, ana, c);
    await a.page.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
    const told = c.L.notifications.types.share.replace(/<\/?b>/g, '').replace('{{name}}', bob.username);
    const rows = a.page.locator('.notif-sentence', { hasText: told });
    await shows(rows.first());
    check(`${tag}: Ana is told "${told}", once per post`, (await rows.count()) === 2, String(await rows.count()));
    await a.ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
