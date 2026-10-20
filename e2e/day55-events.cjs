// Day 55: events (headless Edge, throwaway stack: alice(1), bob(2)).
// Alice creates an event in the app; bob finds it under Discover, says
// Going, then Interested, and it moves to his events. Logged out, the
// public event still shows (without the buttons). A followers-only event
// stays hidden from bob. Alice cancels it, after asking; bob sees it
// marked. Arabic (RTL) + dark at 375px with axe.
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
const api = (who, method, url, body) => fetch(API + url, {
  method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined
});
// A hidden event answers 404 -- expected once, below.
const EXPECTED = /status of 404/;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const open = async (who, url, { theme = 'light', lang = 'en', width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    if (who) {
      await ctx.addInitScript(([t, id, name, th, l]) => {
        localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', name);
        localStorage.setItem('emailVerified', 'true'); localStorage.setItem('theme', th); localStorage.setItem('lang', l);
      }, [tokens[who], who === 'alice' ? 1 : 2, who, theme, lang]);
    }
    const tab = await ctx.newPage();
    tab.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    tab.on('console', (m) => { if (m.type() === 'error' && !EXPECTED.test(m.text())) errors.push(`${who}: ${m.text()}`); });
    await tab.goto(WEB + url, { waitUntil: 'networkidle' });
    return tab;
  };
  const axe = async (tab, label, selector = '.screen-enter') => {
    await tab.waitForTimeout(400);
    await tab.evaluate(AXE);
    const r = await tab.evaluate((sel) => window.axe.run(document.querySelector(sel) || document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    }), selector);
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    check(`${label}: axe finds nothing serious`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`).join(' | '));
  };

  // 1. Alice creates one from the Menu.
  const alice = await open('alice', '/menu');
  await alice.getByRole('button', { name: /^Events/ }).click();
  await alice.waitForURL(`${WEB}/events`, { timeout: 8000 }).catch(() => {});
  await alice.getByRole('button', { name: /Create/ }).click();
  await alice.getByLabel('Event name').fill('Beach clean-up');
  await alice.getByLabel('Location (optional)').fill('North pier');
  await alice.getByLabel('Details (optional)').fill('Bring gloves and water.');
  check('the form says which time zone the times are in', (await alice.getByText(/^Your time zone:/).count()) === 1);
  await axe(alice, 'en/light, Create event');
  await alice.getByRole('button', { name: 'Create event' }).click();
  await alice.getByRole('heading', { name: 'Beach clean-up', level: 2 }).waitFor({ timeout: 8000 }).catch(() => {});
  const eventId = Number(sql("SELECT id FROM events WHERE name = 'Beach clean-up'"));
  check('Create event opens the new event page', alice.url() === `${WEB}/events/${eventId}`
    && (await alice.getByText('North pier').count()) === 1 && (await alice.getByText('Hosted by alice', { exact: false }).count()) === 1);
  check('the host gets Edit, Cancel and Delete, not Going', (await alice.getByRole('button', { name: 'Edit event' }).count()) === 1
    && (await alice.getByRole('button', { name: 'Cancel event' }).count()) === 1 && (await alice.getByRole('button', { name: 'Going', exact: true }).count()) === 0);
  await axe(alice, 'en/light, event page (host)');

  // 2. Bob finds it and answers.
  const bob = await open('bob', '/events?tab=discover');
  const row = bob.getByRole('link', { name: /Beach clean-up/ });
  await row.waitFor({ timeout: 8000 }).catch(() => {});
  check('Discover lists it', (await row.count()) === 1);
  await axe(bob, 'en/light, Events list');
  await row.click();
  await bob.getByRole('button', { name: 'Going', exact: true }).click();
  await bob.getByRole('button', { name: 'Going', exact: true, pressed: true }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Going: pressed, counted, and he is in the guest list', (await bob.getByText(/1 going/).count()) >= 1
    && (await bob.getByRole('link', { name: 'bob' }).count()) === 1);
  await bob.getByRole('button', { name: 'Interested', exact: true }).click();
  await bob.getByRole('button', { name: 'Interested', exact: true, pressed: true }).waitFor({ timeout: 8000 }).catch(() => {});
  check('Interested replaces Going', sql(`SELECT status FROM event_responses WHERE event_id = ${eventId} AND user_id = 2`) === 'interested');
  await bob.goto(`${WEB}/events`, { waitUntil: 'networkidle' });
  const mine = bob.getByRole('link', { name: /Beach clean-up/ });
  await mine.waitFor({ timeout: 8000 }).catch(() => {});
  check('...and it moves to his events, marked Interested', (await mine.getByText('Interested').count()) === 1);

  // 2b. Step 3: the server's ticker reminds him when it's an hour away.
  sql(`UPDATE events SET starts_at = now() + interval '30 minutes' WHERE id = ${eventId}`);
  for (let i = 0; i < 45 && sql(`SELECT COUNT(*) FROM notifications WHERE event_id = ${eventId} AND type = 'event_reminder'`) === '0'; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await bob.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
  const reminder = bob.getByText('Beach clean-up', { exact: true });
  await reminder.first().waitFor({ timeout: 8000 }).catch(() => {});
  check('the ticker reminds him: "Beach clean-up starts at …"', /Beach clean-up starts at \d/.test(await reminder.first().locator('..').innerText().catch(() => '')));
  await axe(bob, 'en/light, Notifications with an event reminder');

  // 3. A followers-only event stays hidden from bob.
  const secret = await (await api('alice', 'POST', '/events', { name: 'Family dinner', startsAt: new Date(Date.now() + 72 * 3600e3).toISOString(), audience: 'followers' })).json();
  await bob.goto(`${WEB}/events/${secret.id}`, { waitUntil: 'networkidle' });
  check("a followers-only event isn't shown to someone who doesn't follow the host", (await bob.getByText('This event no longer exists.').count()) === 1);
  await bob.context().close();

  // 4. Logged out: the public event shows, without the buttons.
  const guest = await open(null, `/events/${eventId}`);
  await guest.getByRole('heading', { name: 'Beach clean-up', level: 2 }).waitFor({ timeout: 8000 }).catch(() => {});
  check('logged out: the public event shows, without Going / Interested', (await guest.getByRole('heading', { name: 'Beach clean-up', level: 2 }).count()) === 1
    && (await guest.getByRole('button', { name: 'Going', exact: true }).count()) === 0);
  await guest.context().close();

  // 5. Alice cancels it.
  await alice.getByRole('button', { name: 'Cancel event' }).click();
  await alice.getByRole('dialog').getByRole('button', { name: 'Cancel event' }).click();
  await alice.getByText('The host cancelled this event.').waitFor({ timeout: 8000 }).catch(() => {});
  check('Cancel asks first, then marks it', sql(`SELECT cancelled_at IS NOT NULL FROM events WHERE id = ${eventId}`) === 't');
  await alice.context().close();
  const bob2 = await open('bob', `/events/${eventId}`);
  await bob2.getByText('The host cancelled this event.').waitFor({ timeout: 8000 }).catch(() => {});
  check('bob sees it cancelled, with no answer buttons', (await bob2.getByRole('button', { name: 'Interested', exact: true }).count()) === 0);
  await bob2.goto(`${WEB}/notifications`, { waitUntil: 'networkidle' });
  await bob2.getByRole('button', { name: 'Open event Beach clean-up' }).first().waitFor({ timeout: 8000 }).catch(() => {});
  check('...and was told: "alice cancelled Beach clean-up"', (await bob2.getByText(/alice cancelled Beach clean-up/).count()) === 1);
  await bob2.context().close();

  // 6. Arabic, dark, 375px.
  const arEvent = await (await api('alice', 'POST', '/events', { name: 'حفلة الحي', location: 'الحديقة', startsAt: new Date(Date.now() + 26 * 3600e3).toISOString() })).json();
  await api('bob', 'PUT', `/events/${arEvent.id}/response`, { status: 'going' });
  const ar = await open('bob', `/events/${arEvent.id}`, { lang: 'ar', theme: 'dark', width: 375 });
  await ar.getByRole('button', { name: AR.events.going, exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
  check('ar: the event in Arabic, right to left, no sideways scroll', (await ar.getByRole('button', { name: AR.events.going, exact: true, pressed: true }).count()) === 1
    && (await ar.evaluate(() => document.documentElement.dir)) === 'rtl'
    && (await ar.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await axe(ar, 'ar/dark, event page');
  await ar.screenshot({ path: path.join(SP, 'day55-event-ar-dark-375.png') });
  await ar.goto(`${WEB}/events/new`, { waitUntil: 'networkidle' });
  await ar.getByLabel(AR.events.form.name).waitFor({ timeout: 8000 }).catch(() => {});
  await axe(ar, 'ar/dark, Create event');
  await ar.screenshot({ path: path.join(SP, 'day55-form-ar-dark-375.png'), fullPage: true });
  await ar.context().close();

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); process.exit(2); });
