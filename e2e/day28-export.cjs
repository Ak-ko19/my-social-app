// Day 28: "Download your information" in headless Edge (throwaway stack:
// alice(1), bob(2)). Settings -> Account -> Download my data saves a JSON
// file with alice's own data and none of bob's private fields; the section
// works in dark mode and in Arabic (RTL) at phone width.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);

(async () => {
  // Something to export: alice posts, bob comments on it and messages her.
  const form = new FormData();
  form.append('content', 'Export me please — မင်္ဂလာပါ');
  const post = await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${aliceToken}` }, body: form }).then((r) => r.json());
  const json = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  await fetch(`${API}/posts/${post.id}/comments`, { method: 'POST', headers: json(bobToken), body: JSON.stringify({ content: 'Lovely' }) });
  const conv = await fetch(`${API}/conversations`, { method: 'POST', headers: json(bobToken), body: JSON.stringify({ userId: 1 }) }).then((r) => r.json());
  await fetch(`${API}/conversations/${conv.id}/messages`, { method: 'POST', headers: json(bobToken), body: JSON.stringify({ content: 'Hi alice' }) });
  const bob = await fetch(`${API}/profile/me`, { headers: json(bobToken) }).then((r) => r.json());

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const newPage = async ({ theme = 'light', lang = 'en' } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await ctx.addInitScript(([t, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', '1');
      localStorage.setItem('username', 'alice'); localStorage.setItem('emailVerified', 'true');
      localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [aliceToken, theme, lang]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };

  // 1. The main flow, from Settings.
  const page = await newPage();
  await page.goto(`${WEB}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Security & Privacy/ }).click();
  await page.getByRole('heading', { name: 'Download your information' }).waitFor({ timeout: 8000 });
  check('Account screen has a "Download your information" section', true);
  const button = page.getByRole('button', { name: 'Download my data' });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), button.click()]);
  const today = new Date().toISOString().slice(0, 10);
  check('the file is named after the account and the date', download.suggestedFilename() === `mysocialapp-alice-${today}.json`, download.suggestedFilename());
  const file = path.join(SP, 'day28-export.json');
  await download.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  let data = null;
  try { data = JSON.parse(text); } catch { /* checked below */ }
  fs.unlinkSync(file);
  check('it is valid JSON in the export format', data && data.format === 'mysocialapp-data-export' && data.version === 1);
  check('it holds alice\'s profile and her post (Myanmar text intact)', data?.profile?.username === 'alice' && data.posts.some((p) => p.id === post.id && p.content.includes('မင်္ဂလာပါ')));
  check('it holds the conversation with bob\'s message', data?.conversations?.some((c) => c.participants.includes('bob') && c.messages.some((m) => m.sender === 'bob' && m.content === 'Hi alice')));
  check('no password hash and none of bob\'s private fields', !/password|reset_token|verification_token/.test(text) && !text.includes(bob.email));
  await page.getByRole('status').filter({ hasText: 'Your file has been downloaded.' }).waitFor({ timeout: 5000 }).catch(() => {});
  check('the screen confirms the download', (await page.getByText('Your file has been downloaded.').count()) === 1);
  check('the button is ready again', await button.isEnabled());

  // 2. A failure shows the server's message, not a silent nothing.
  await page.route('**/profile/export', (route) => route.fulfill({ status: 429, contentType: 'text/plain', body: 'Too many downloads. Please try again in an hour.' }));
  await button.click();
  await page.getByRole('alert').waitFor({ timeout: 5000 }).catch(() => {});
  check('a refused download shows why', (await page.getByRole('alert').textContent())?.includes('Too many downloads'));
  await page.unroute('**/profile/export');
  const errorCount = errors.length;
  // (The 429 above is logged by the browser and by the screen on purpose.)
  errors.splice(0, errorCount, ...errors.slice(0, errorCount).filter((e) => !/429|Too Many|status code 429/i.test(e)));

  // 3. Dark mode and Arabic (RTL): readable, nothing wider than the phone.
  for (const [theme, lang, title, label] of [['dark', 'en', 'Download your information', 'Download my data'], ['light', 'ar', 'تنزيل معلوماتك', 'تنزيل بياناتي']]) {
    const p = await newPage({ theme, lang });
    await p.goto(`${WEB}/settings/account`, { waitUntil: 'networkidle' });
    await p.getByRole('heading', { name: title }).waitFor({ timeout: 8000 }).catch(() => {});
    const b = p.getByRole('button', { name: label });
    const box = await b.boundingBox();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const dir = await p.evaluate(() => document.documentElement.dir);
    check(`${theme}/${lang}: section shows, button fits, no sideways scroll`, (await b.count()) === 1 && box && box.x >= 0 && box.x + box.width <= 390 && !overflow, JSON.stringify(box));
    if (lang === 'ar') check('Arabic page is right-to-left', dir === 'rtl', dir);
    await p.screenshot({ path: path.join(SP, `day28-export-${theme}-${lang}.png`) });
    await p.context().close();
  }

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
