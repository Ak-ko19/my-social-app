// Day 74: Home loads its later pages by the server's cursor (nextCursor),
// not by page number. A fresh account with 45 posts of its own scrolls
// Home to the end, in EN/light and AR/dark (RTL): every post arrives once,
// newest first -- including two written in the same millisecond on either
// side of a page break (a millisecond cursor would skip one) -- and the
// oldest post is the last card.
// Throwaway stack from e2e-up.sh.
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const DB = `${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e`;
const TOTAL = 45;
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${DB} -Atc "${q}"`, { encoding: 'utf8' }).trim();
const label = (n) => `Paging post ${String(n).padStart(2, '0')}`;

const CASES = [
  { lang: 'en', theme: 'light', width: 390 },
  { lang: 'ar', theme: 'dark', width: 375 }
];

async function account() {
  const username = `pager${Date.now() % 1e8}`;
  const body = { username, email: `${username}@example.com`, password: 'a-fine-password-123' };
  const json = { 'Content-Type': 'application/json' };
  const signup = await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify(body) });
  if (!signup.ok) throw new Error(`signup ${signup.status}`);
  const login = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify(body) })).json();
  return { ...login, username };
}

(async () => {
  const me = await account();
  // Post 1 is the newest, a minute apart. Posts 20 and 21 (the first page
  // break, 20 per page) share a millisecond and differ by a microsecond.
  // (One line: a newline would end the command on Windows.)
  sql(`INSERT INTO posts (user_id, content, created_at) SELECT ${me.id}, 'Paging post ' || lpad(g::text, 2, '0'), timestamp '2026-01-01 12:00:00' - g * interval '1 minute' FROM generate_series(1, ${TOTAL}) g`);
  sql(`UPDATE posts SET created_at = timestamp '2026-01-01 11:40:00.000002' WHERE user_id = ${me.id} AND content = '${label(20)}'`);
  sql(`UPDATE posts SET created_at = timestamp '2026-01-01 11:40:00.000001' WHERE user_id = ${me.id} AND content = '${label(21)}'`);
  const expected = Array.from({ length: TOTAL }, (_, i) => label(i + 1));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of CASES) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
    await ctx.addInitScript(([u, lang, theme]) => {
      localStorage.setItem('token', u.token); localStorage.setItem('userId', String(u.id));
      localStorage.setItem('username', u.username); localStorage.setItem('emailVerified', 'true');
      localStorage.setItem('theme', theme); localStorage.setItem('lang', lang);
    }, [me, c.lang, c.theme]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    const calls = [];
    page.on('response', async (res) => {
      const url = new URL(res.url());
      if (url.origin !== API || url.pathname !== '/feed') return;
      const data = await res.json().catch(() => null);
      calls.push({ params: url.searchParams, status: res.status(), posts: data?.posts?.map((p) => p.content) ?? [] });
    });

    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
    await page.locator('article.post-card').first().waitFor();
    // Scroll to the end until Home stops asking for more.
    for (let n = 0, seen = -1; n < 15 && seen !== calls.length; n += 1) {
      seen = calls.length;
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
    }

    // The first page may be asked for twice: React's StrictMode runs
    // effects twice on the dev server (the hook keeps the latest answer).
    const firsts = calls.filter((x) => !x.params.has('cursor'));
    const later = calls.filter((x) => x.params.has('cursor'));
    const got = [...(firsts[firsts.length - 1]?.posts ?? []), ...later.flatMap((x) => x.posts)];
    check(`${tag}: first page, then 2 more by cursor (20 + 20 + 5)`, firsts.length >= 1 && later.length === 2, calls.map((x) => x.posts.length).join('+'));
    check(`${tag}: all answered 200`, calls.every((x) => x.status === 200));
    check(`${tag}: the first pages come before any cursor`, calls.slice(0, firsts.length).every((x) => !x.params.has('cursor')));
    check(`${tag}: no request sends a page number`, calls.every((x) => !x.params.has('page')));
    check(`${tag}: every post once, newest first (same-millisecond pair kept)`, JSON.stringify(got) === JSON.stringify(expected), `${got.length} posts`);
    const last = page.locator('article.post-card', { hasText: label(TOTAL) });
    check(`${tag}: the oldest post is on screen at the end`, await last.isVisible());
    check(`${tag}: no loading row left`, (await page.locator('.feed-loading-more').count()) === 0);
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
    await page.screenshot({ path: path.join(SP, `day74-feed-end-${c.lang}-${c.theme}-${c.width}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
