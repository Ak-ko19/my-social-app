// Day 100: replying and reacting to a story. Ana follows Bob and Cy; both
// have a story, but Cy takes messages from nobody. In Bob's story Ana types
// a reply (the story waits) and sends it ("Sent"), then taps a quick
// reaction; Cy's story has no reply box. Bob's chat with Ana shows both
// with "Replied to your story" / "Reacted to your story" and the story's
// photo, the reaction as a big emoji; once the story has expired it says
// "Story unavailable". axe on the viewer and the chat. EN/light 390 px and
// AR/dark 375 px (RTL). Throwaway stack from e2e-up.sh.
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
const IMG = `${WEB}/icon-512.png`;
const PASSWORD = 'a-fine-password-123';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const shows = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const json = { 'Content-Type': 'application/json' };
const as = (user) => ({ Authorization: `Bearer ${user.token}` });
const fill = (text, name) => text.replace('{{name}}', name);

async function account(name) {
  await fetch(`${API}/signup`, { method: 'POST', headers: json, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: PASSWORD }) });
  const me = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: `${name}@example.com`, password: PASSWORD }) })).json();
  await fetch(`${API}/profile/onboarding/done`, { method: 'POST', headers: as(me) });
  return me;
}

async function signedIn(browser, user, c, tag) {
  const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 } });
  await ctx.addInitScript(([t, id, name, lang, theme]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
    localStorage.setItem('emailVerified', 'true'); localStorage.setItem('lang', lang); localStorage.setItem('theme', theme);
  }, [user.token, user.id, user.username, c.lang, c.theme]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: ${r.status()} ${r.request().method()} ${r.url()}`); });
  return { ctx, page };
}

async function axeOf(page, selector) {
  await page.addScriptTag({ content: AXE });
  return (await page.evaluate((sel) => window.axe.run(sel), selector)).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const c of [{ lang: 'en', theme: 'light', width: 390, L: EN }, { lang: 'ar', theme: 'dark', width: 375, L: AR }]) {
    const tag = `${c.lang}/${c.theme}/${c.width}px`;
    const S = c.L.stories;
    const M = c.L.messages.story;
    const [ana, bob, cy] = await Promise.all(['ana', 'bob', 'cy'].map((n) => account(`${n}100${c.lang}`)));
    for (const author of [bob, cy]) await fetch(`${API}/users/${author.id}/follow`, { method: 'POST', headers: as(ana) });
    await fetch(`${API}/profile/interactions`, { method: 'PUT', headers: { ...as(cy), ...json }, body: JSON.stringify({ messagePermission: 'nobody' }) });
    const storyId = sql(`INSERT INTO stories (user_id, media_url) VALUES (${bob.id}, '${IMG}') RETURNING id`).split('\n')[0];
    sql(`INSERT INTO stories (user_id, media_url) VALUES (${cy.id}, '${IMG}')`);

    // ---- Ana replies and reacts ----
    const { ctx, page } = await signedIn(browser, ana, c, tag);
    await page.goto(WEB, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: fill(S.viewNew, bob.username), exact: true }).click();
    const viewer = page.getByRole('dialog', { name: fill(S.label, bob.username) });
    check(`${tag}: Bob's story opens`, await shows(viewer));
    const box = viewer.getByRole('textbox', { name: fill(S.replyLabel, bob.username) });
    check(`${tag}: it has a reply box and 8 quick reactions`, await shows(box)
      && (await viewer.getByRole('group', { name: S.reactionsLabel }).getByRole('button').count()) === 8);
    const inside = await viewer.locator('.story-viewer-reaction').evaluateAll((els) => els.every((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth && r.width >= 24;
    }));
    check(`${tag}: ...all eight fully on screen, each at least 24 px wide`, inside);
    await box.fill('Lovely view!');
    await page.waitForTimeout(6000);
    check(`${tag}: the story waits while a reply is typed (no next story, no close)`, await viewer.isVisible()
      && (await viewer.locator('.story-viewer-segment-fill.is-paused').count()) === 1);
    check(`${tag}: html dir`, (await page.getAttribute('html', 'dir')) === (c.lang === 'ar' ? 'rtl' : 'ltr'));
    check(`${tag}: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    const viewerAxe = await axeOf(page, '.story-viewer');
    check(`${tag}: the viewer has no serious axe issues`, viewerAxe.length === 0, viewerAxe.join(', '));
    await page.screenshot({ path: path.join(SP, `day100-story-reply-${c.lang}-${c.theme}.png`) });
    await box.press('Enter');
    check(`${tag}: the reply is sent ("Sent")`, await shows(viewer.getByRole('status').filter({ hasText: S.replySent })) && (await box.inputValue()) === '');
    await viewer.getByRole('button', { name: S.reactions.fire, exact: true }).click();
    await page.waitForTimeout(500);
    const sent = sql(`SELECT content || ':' || story_reply FROM messages WHERE story_id = ${storyId} AND sender_id = ${ana.id} ORDER BY id`).replaceAll(String.fromCharCode(13), '');
    check(`${tag}: ...and the reaction: both are messages to Bob with the story`, sent === 'Lovely view!:reply\n🔥:reaction', JSON.stringify(sent));

    // Cy takes messages from nobody: no reply box on Cy's story.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: fill(S.viewNew, cy.username), exact: true }).click();
    const cyViewer = page.getByRole('dialog', { name: fill(S.label, cy.username) });
    check(`${tag}: Cy's story (no messages from Ana) has no reply box`, await shows(cyViewer)
      && (await cyViewer.getByRole('textbox').count()) === 0 && (await cyViewer.getByRole('group').count()) === 0);
    await ctx.close();

    // ---- Bob sees them in the chat ----
    const chat = sql(`SELECT conversation_id FROM messages WHERE story_id = ${storyId} LIMIT 1`).trim();
    const bobView = await signedIn(browser, bob, c, tag);
    await bobView.page.goto(`${WEB}/messages/${chat}`, { waitUntil: 'networkidle' });
    const thread = bobView.page.locator('.messages-thread');
    await shows(thread);
    const cards = thread.locator('.messages-story-card');
    check(`${tag}: Bob's chat: "Replied to your story" and "Reacted to your story"`, await shows(cards.first())
      && (await cards.locator('.messages-story-label').allInnerTexts()).join('|') === `${M.repliedOther}|${M.reactedOther}`);
    check(`${tag}: ...each with the story's photo`, (await thread.getByRole('img', { name: M.alt, exact: true }).count()) === 2);
    const emoji = thread.locator('.messages-bubble-emoji');
    check(`${tag}: ...the reaction as a big emoji`, (await emoji.innerText()) === '🔥'
      && (await emoji.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 36);
    const chatAxe = await axeOf(bobView.page, '.messages-thread');
    check(`${tag}: the chat has no serious axe issues`, chatAxe.length === 0, chatAxe.join(', '));
    await bobView.page.screenshot({ path: path.join(SP, `day100-story-chat-${c.lang}-${c.theme}.png`) });

    // Expired: still story replies, without the story.
    sql(`UPDATE stories SET expires_at = now() - interval '1 minute' WHERE id = ${storyId}`);
    await bobView.page.reload({ waitUntil: 'networkidle' });
    await shows(thread);
    check(`${tag}: once the story has expired: "Story unavailable"`, await shows(thread.getByText(M.unavailable, { exact: true }).first())
      && (await thread.getByText(M.unavailable, { exact: true }).count()) === 2
      && (await thread.getByRole('img', { name: M.alt, exact: true }).count()) === 0);
    await bobView.ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
