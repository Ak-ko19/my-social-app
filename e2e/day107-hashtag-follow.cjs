// Days 107-108: following a hashtag. Ben posts with #chai107<lang>; so do
// Dee (a private account) and Cal (whom Ann follows). Ann opens the tag and
// taps Follow: it says Following and what that does. Home then has Ben's
// post with "#chai107<lang> · You follow this hashtag" (Cal's without the
// line, Dee's not at all). "Unfollow #tag" in Ben's post menu takes it off
// Home and says so, with Undo, which brings it back. Settings > Hashtags you
// follow lists it; Unfollow there empties the list, and the tag's page
// offers Follow again. axe on each screen.
// EN/light 390 px and AR/dark 375 px (RTL). Throwaway stack from e2e-up.sh.
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
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim().replace(/\r/g, '');
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
const fill = (text, values) => Object.entries(values).reduce((t, [k, v]) => t.split(`{{${k}}}`).join(v), text);

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}

async function axe(page, tag, what, scope = '.screen-enter') {
  await page.waitForTimeout(700); // the screen's entrance animation
  await page.addScriptTag({ content: AXE });
  const bad = (await page.evaluate((sel) => window.axe.run(sel), scope)).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(`${tag}: ${what}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`).join(' | '));
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const H = c.L.hashtag;
    const F = c.L.followedTags;
    const [ann, ben, cal, dee] = await Promise.all(['ann', 'ben', 'cal', 'dee'].map((n) => account(`${n}107${c.lang}`)));
    const word = `chai107${c.lang}`;
    await fetch(`${API}/profile/privacy`, { method: 'PUT', headers: { ...as(dee), ...json }, body: JSON.stringify({ isPrivate: true }) });
    await fetch(`${API}/users/${cal.id}/follow`, { method: 'POST', headers: as(ann) });
    const say = async (user, content) => {
      const form = new FormData();
      form.append('content', content);
      await fetch(`${API}/posts`, { method: 'POST', headers: as(user), body: form });
    };
    await say(dee, `Secret #${word}`);
    await say(cal, `From a friend #${word}`);
    await say(ben, `Afternoon #${word}`);

    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([t, id, name, lang, theme]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
    }, [ann.token, ann.id, ann.username, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });

    // 1. Follow from the tag's page.
    await page.goto(`${WEB}/hashtag/${word}`, { waitUntil: 'networkidle' });
    const follow = page.getByRole('button', { name: H.follow, exact: true });
    check(`${tag}: the tag's page offers Follow`, await shows(follow) && (await follow.getAttribute('aria-pressed')) === 'false');
    await follow.click();
    const following = page.getByRole('button', { name: H.following, exact: true });
    check(`${tag}: ...then says Following, and what that does`, await shows(following) && (await following.getAttribute('aria-pressed')) === 'true'
      && await shows(page.getByText(H.followingNote, { exact: true })));
    check(`${tag}: ...kept on the server`, sql(`SELECT count(*) FROM hashtag_follows WHERE user_id = ${ann.id}`) === '1');
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: tag page: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await axe(page, tag, 'the tag page, following');
    await page.screenshot({ path: path.join(SP, `day107-tag-${c.lang}-${c.theme}.png`) });

    // 2. Home: Ben's post, saying which tag brought it.
    const F2 = c.L.feed;
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    const bens = page.locator('article').filter({ hasText: `Afternoon #${word}` });
    const via = bens.locator('.post-card-via');
    check(`${tag}: Home has Ben's post, saying the tag brought it`, await shows(bens)
      && (await via.innerText()).includes(`#${word}`) && (await via.innerText()).includes(F2.viaHashtag)
      && (await via.getByRole('link').getAttribute('href')) === `/hashtag/${word}`);
    const cals = page.locator('article').filter({ hasText: `From a friend #${word}` });
    check(`${tag}: ...a followed person's tagged post has no tag line`, await shows(cals) && (await cals.locator('.post-card-via').count()) === 0);
    check(`${tag}: ...a private account's tagged post isn't there`, (await page.locator('article').filter({ hasText: `Secret #${word}` }).count()) === 0);
    check(`${tag}: Home: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await axe(page, tag, 'Home with a tag post', '#root');
    await page.screenshot({ path: path.join(SP, `day107-home-${c.lang}-${c.theme}.png`) });

    // 3. Unfollow from the post's menu, then Undo.
    await bens.getByRole('button', { name: c.L.postMenu.moreOptions, exact: true }).click();
    await page.getByRole('menuitem', { name: fill(F2.unfollowTag, { tag: word }), exact: true }).click();
    const notice = page.locator('.feed-tag-notice');
    check(`${tag}: Unfollow from the post: it leaves Home, and Home says so`, await shows(notice)
      && (await notice.innerText()).includes(fill(F2.unfollowedTag, { tag: word }))
      && (await bens.count()) === 0 && await shows(cals)
      && sql(`SELECT count(*) FROM hashtag_follows WHERE user_id = ${ann.id}`) === '0');
    await axe(page, tag, 'Home after unfollowing', '#root');
    await page.screenshot({ path: path.join(SP, `day107-unfollowed-${c.lang}-${c.theme}.png`) });
    await notice.getByRole('button', { name: F2.undo, exact: true }).click();
    check(`${tag}: Undo follows it again and brings the post back`, await shows(bens)
      && (await notice.count()) === 0 && sql(`SELECT count(*) FROM hashtag_follows WHERE user_id = ${ann.id}`) === '1');

    // 4. Settings > Hashtags you follow.
    await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
    const row = page.getByRole('button', { name: c.L.settings.rows['followed-hashtags'] });
    check(`${tag}: Settings has "Hashtags you follow"`, await shows(row));
    await row.click();
    await page.waitForURL('**/settings/hashtags');
    const link = page.getByRole('link', { name: `#${word}`, exact: true });
    check(`${tag}: ...which lists the tag, linking to its posts`, await shows(link) && (await link.getAttribute('href')) === `/hashtag/${word}`);
    await axe(page, tag, 'Hashtags you follow');
    await page.screenshot({ path: path.join(SP, `day107-list-${c.lang}-${c.theme}.png`) });
    await page.getByRole('button', { name: fill(F.unfollowTag, { tag: word }), exact: true }).click();
    check(`${tag}: Unfollow empties the list and says how to follow one`, await shows(page.getByText(F.empty, { exact: true }))
      && sql(`SELECT count(*) FROM hashtag_follows WHERE user_id = ${ann.id}`) === '0');

    // 5. Back on the tag's page, Follow again.
    await page.goto(`${WEB}/hashtag/${word}`, { waitUntil: 'networkidle' });
    check(`${tag}: the tag's page offers Follow again`, await shows(page.getByRole('button', { name: H.follow, exact: true })));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
