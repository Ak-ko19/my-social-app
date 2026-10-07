// Day 45: drafts and scheduled posts (headless Edge, throwaway stack:
// alice(1), bob(2)). Alice saves a draft, opens it again and schedules it
// for a time she picks (local time, shown back the same); when it falls
// due the server's own ticker posts it and tells her. A photo draft opens
// with its photos and posts as it is. A group draft whose author was
// removed from the group comes back with the reason. Arabic (RTL) + dark
// at 375px, English dark on desktop; axe on the Drafts screen and the
// composer; deleting asks first. And a poll that ends: the server tells
// its author and voters.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(SP, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const AR = JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', 'ar.json'), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const tokens = { alice: fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim(), bob: fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim() };
const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The server's ticker runs every 30 s.
async function until(test, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return true;
    await sleep(1000);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Asia/Dubai' });
    await ctx.addInitScript(([t, id, name, th, l]) => {
      localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
      localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
    }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
    await page.goto(WEB + url, { waitUntil: 'networkidle' });
    return page;
  };
  const axe = async (page, label) => {
    await page.waitForTimeout(400); // the screen-enter animation (as day26-a11y)
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document.querySelector('.screen-enter'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }));
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };
  const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // 1. Alice writes something and saves it for later.
  const alice = await open('alice', '/create-post');
  await alice.getByRole('textbox', { name: 'Post' }).fill('Weekend plans #hiking');
  await alice.getByRole('button', { name: 'Save draft' }).click();
  await alice.waitForURL(`${WEB}/drafts`, { timeout: 10000 }).catch(() => {});
  await alice.locator('.draft-card').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('"Save draft" opens Drafts, with the draft in it', (await alice.locator('.draft-card-text').allInnerTexts()).join() === 'Weekend plans #hiking');
  check('the Drafts tab counts 1, Scheduled 0',
    (await alice.getByRole('tab', { name: /Drafts/ }).innerText()).includes('1') && (await alice.getByRole('tab', { name: /Scheduled/ }).innerText()).includes('0'));
  const draftId = Number(sql('SELECT id FROM post_drafts ORDER BY id DESC LIMIT 1'));

  // 2. She opens it again and schedules it for 2 hours from now.
  await alice.getByRole('button', { name: 'Edit', exact: true }).click();
  await alice.getByRole('heading', { name: 'Edit draft' }).waitFor({ timeout: 10000 }).catch(() => {});
  check('Edit opens it in the composer', (await alice.getByRole('textbox', { name: 'Post' }).inputValue()) === 'Weekend plans #hiking');
  await alice.getByRole('checkbox', { name: 'Schedule for later' }).check();
  check('the picker says which time zone it is in', (await alice.getByText('Your time zone: Asia/Dubai').count()) === 1);
  // In the browser's own (Dubai) time, like the picker.
  const when = new Date(Date.now() + 2 * 60 * 60 * 1000);
  when.setSeconds(0, 0);
  const whenDubai = new Date(when.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  await alice.getByLabel('Date and time').fill(localInput(whenDubai));
  await alice.getByRole('button', { name: 'Schedule', exact: true }).click();
  await alice.waitForURL(`${WEB}/drafts?tab=scheduled`, { timeout: 10000 }).catch(() => {});
  await alice.locator('.draft-card').first().waitFor({ timeout: 10000 }).catch(() => {});
  const stored = Number(sql(`SELECT extract(epoch FROM scheduled_for)::bigint FROM post_drafts WHERE id = ${draftId}`));
  check('stored for exactly the picked moment', stored * 1000 === when.getTime(), `${stored * 1000} vs ${when.getTime()}`);
  const whenText = await alice.locator('.draft-card-when').innerText();
  check('shown back in her time: "Posts <date> <hh:mm>"', whenText.startsWith('Posts ') && whenText.includes(`${pad(whenDubai.getMinutes())}`), whenText);
  await axe(alice, 'en/light, Scheduled tab');

  // 3. The time comes: the server posts it by itself and tells her.
  sql(`UPDATE post_drafts SET scheduled_for = now() WHERE id = ${draftId}`);
  const published = await until(() => sql("SELECT COUNT(*) FROM posts WHERE content = 'Weekend plans #hiking'") === '1');
  check('due -> posted by the server within ~30 s', published);
  check('...the draft is gone', sql(`SELECT COUNT(*) FROM post_drafts WHERE id = ${draftId}`) === '0');
  await alice.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await alice.locator('article.post-card').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('...first on her Home feed', (await alice.locator('article.post-card').first().innerText()).includes('Weekend plans'));
  await alice.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
  check('...and the notification says so', (await alice.getByText('Your scheduled post was published').count()) === 1);

  // 4. A draft with photos (seeded: the e2e stack has no Cloudinary) opens
  // with them and posts as it is.
  const photoDraft = sql(`INSERT INTO post_drafts (user_id, content, media_urls) VALUES (1, 'Sunset from the hill', ARRAY['${WEB}/icon-192.png','${WEB}/icon-512.png']) RETURNING id`).split('\n')[0];
  await alice.goto(`${WEB}/create-post?draftId=${photoDraft}`, { waitUntil: 'networkidle' });
  await alice.locator('.image-picker-item').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('a photo draft opens with its 2 photos', (await alice.locator('.image-picker-item').count()) === 2);
  check('...and the poll is off while it has photos', await alice.getByRole('button', { name: 'Add a poll' }).isDisabled());
  await alice.getByRole('button', { name: 'Remove image 1' }).click();
  await alice.getByRole('button', { name: 'Post', exact: true }).click();
  await alice.waitForURL(`${WEB}/`, { timeout: 10000 }).catch(() => {});
  const photoPost = sql("SELECT id FROM posts WHERE content = 'Sunset from the hill'");
  check('"Post" publishes it, with the photo she kept', photoPost !== '' && sql(`SELECT string_agg(url, ',') FROM post_media WHERE post_id = ${photoPost || 0}`) === `${WEB}/icon-512.png`);
  await alice.context().close();

  // 5. A group post scheduled, then alice is removed from the group: it
  // comes back to her drafts with the reason.
  const bobJson = { Authorization: `Bearer ${tokens.bob}`, 'Content-Type': 'application/json' };
  const group = await (await fetch(`${API}/communities`, { method: 'POST', headers: bobJson, body: JSON.stringify({ name: 'Trail Club', privacy: 'public' }) })).json();
  await fetch(`${API}/communities/${group.id}/join`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}` } });
  const form = new FormData();
  form.append('content', 'Trail report for the club');
  form.append('communityId', String(group.id));
  form.append('scheduledFor', new Date(Date.now() + 60 * 60 * 1000).toISOString());
  const groupDraft = await (await fetch(`${API}/drafts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}` }, body: form })).json();
  await fetch(`${API}/communities/${group.id}/members/1`, { method: 'DELETE', headers: bobJson });
  sql(`UPDATE post_drafts SET scheduled_for = now() WHERE id = ${groupDraft.id}`);
  check('can\'t post there any more -> back to drafts by the server',
    await until(() => sql(`SELECT scheduled_for IS NULL AND last_error IS NOT NULL FROM post_drafts WHERE id = ${groupDraft.id}`) === 't'));

  // 6. Arabic, dark, 375px: the reason in Arabic, right to left.
  const ar = await open('alice', '/drafts', { lang: 'ar', theme: 'dark', width: 375 });
  await ar.locator('.draft-card').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('ar: right-to-left, tabs translated', (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.getByRole('tab', { name: new RegExp(AR.drafts.tab.drafts) }).getAttribute('aria-selected')) === 'true');
  const card = ar.locator('.draft-card', { hasText: 'Trail report' });
  check('ar: the group and the reason, in Arabic', (await card.innerText()).includes('في Trail Club')
    && (await card.innerText()).includes('تعذّر نشره في موعده: انضم إلى هذه المجموعة للنشر فيها'), await card.innerText());
  check('ar: no sideways scroll at 375px', await noSideScroll(ar));
  await axe(ar, 'ar/dark, Drafts tab');
  await ar.screenshot({ path: path.join(SP, 'day45-drafts-ar-dark-375.png') });
  await ar.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
  check('ar: the failure notification', (await ar.getByText(AR.notifications.types.scheduledFailed).count()) === 1);
  await ar.goto(`${WEB}/create-post`, { waitUntil: 'networkidle' });
  await ar.getByRole('checkbox', { name: AR.drafts.scheduleLater }).check();
  check('ar: the composer\'s schedule controls are translated', (await ar.getByRole('button', { name: AR.drafts.schedule, exact: true }).count()) === 1
    && (await ar.getByRole('button', { name: AR.drafts.saveDraft }).count()) === 1);
  await ar.getByLabel(AR.drafts.when).fill(localInput(new Date(Date.now() + 2 * 60 * 1000)));
  await ar.getByRole('textbox', { name: AR.compose.postLabel }).fill('قريبًا');
  await ar.getByRole('button', { name: AR.drafts.schedule, exact: true }).click();
  check('ar: too soon is explained in Arabic', (await ar.getByRole('alert').innerText()) === 'اختر وقتًا بعد 5 دقائق على الأقل من الآن.', await ar.getByRole('alert').innerText().catch(() => ''));
  check('ar: composer fits at 375px', await noSideScroll(ar));
  await axe(ar, 'ar/dark, composer with schedule');
  await ar.screenshot({ path: path.join(SP, 'day45-compose-ar-dark-375.png') });
  await ar.context().close();

  // 7. Desktop, dark: deleting asks first.
  const desk = await open('alice', '/drafts', { theme: 'dark', width: 1280 });
  await desk.locator('.draft-card').first().waitFor({ timeout: 10000 }).catch(() => {});
  await desk.screenshot({ path: path.join(SP, 'day45-drafts-en-dark-1280.png') });
  await desk.locator('.draft-card', { hasText: 'Trail report' }).getByRole('button', { name: 'Delete' }).click();
  const dialog = desk.getByRole('dialog');
  check('delete asks first', (await dialog.getByText('Delete this draft?').count()) === 1);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await desk.locator('.draft-card', { hasText: 'Trail report' }).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  check('...then it is gone', sql(`SELECT COUNT(*) FROM post_drafts WHERE id = ${groupDraft.id}`) === '0');
  await desk.context().close();

  // 8. Step 4: a poll ends -- the server's ticker tells its author and
  // the voter (bob, here in Arabic).
  const pollForm = new FormData();
  pollForm.append('content', 'Sunrise or sunset hike?');
  pollForm.append('poll', JSON.stringify({ options: ['Sunrise', 'Sunset'] }));
  const pollPost = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.alice}` }, body: pollForm })).json();
  await fetch(`${API}/posts/${pollPost.id}/poll/vote`, {
    method: 'POST', headers: { ...bobJson }, body: JSON.stringify({ optionId: pollPost.poll.options[1].id })
  });
  sql(`UPDATE polls SET closes_at = now() - interval '1 second' WHERE post_id = ${pollPost.id}`);
  check('poll ended -> author and voter told by the server within ~30 s',
    await until(() => sql(`SELECT string_agg(type, ',' ORDER BY user_id) FROM notifications WHERE post_id = ${pollPost.id}`) === 'poll_ended_own,poll_ended'));
  const bobAr = await open('bob', '/notifications', { lang: 'ar', theme: 'dark', width: 375 });
  await bobAr.locator('.card-row').first().waitFor({ timeout: 10000 }).catch(() => {});
  check('ar: bob reads "انتهى استطلاع alice. اطّلع على النتائج."', (await bobAr.locator('.card-row').first().innerText()).includes('انتهى استطلاع alice. اطّلع على النتائج.'));
  await bobAr.context().close();

  // Bob never sees alice's drafts.
  const bobDrafts = await (await fetch(`${API}/drafts`, { headers: { Authorization: `Bearer ${tokens.bob}` } })).json();
  check('drafts are private: bob sees none of hers', Array.isArray(bobDrafts) && bobDrafts.length === 0);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
