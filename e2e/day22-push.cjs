// Day 22: web push, end to end on the production build (real service
// worker). The browser's push service is faked: the page's PushManager
// hands out a subscription at the local stub (push-stub.cjs) with real
// P-256 keys, so the backend runs the real web-push encryption and
// delivery. Throwaway stack (E2E_PUSH=1): alice(1), bob(2), conversation 1.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('./node_modules/playwright-core');
const { execSync } = require('child_process');
const { PSQL } = require('./pg.cjs');

const SP = __dirname;
const WEB = 'http://localhost:5173';
const API = 'http://localhost:3000';
const STUB = 'http://127.0.0.1:3903';
const aliceToken = fs.readFileSync(path.join(SP, 'alice.token'), 'utf8').trim();
const bobToken = fs.readFileSync(path.join(SP, 'bob.token'), 'utf8').trim();
const locale = (lang) => JSON.parse(fs.readFileSync(path.join(SP, '..', 'frontend', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8'));
const results = [];
const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
const sql = (q) => execSync(`${PSQL} -h localhost -p 55433 -U testuser -d mysocialapp_e2e -At -c "${q}"`).toString().trim();
const deliveries = async () => (await fetch(`${STUB}/deliveries`)).json();
const settle = () => new Promise((r) => setTimeout(r, 1200));

(async () => {
  const p256dh = crypto.createECDH('prime256v1').generateKeys().toString('base64url');
  const auth = crypto.randomBytes(16).toString('base64url');
  const endpoint = `${STUB}/push/alice-browser`;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(['notifications'], { origin: WEB });
  await ctx.addInitScript(([t, ep, key, au]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', '1'); localStorage.setItem('username', 'alice');
    localStorage.setItem('emailVerified', 'true');
    // The fake push service: subscribe() returns a subscription at the stub.
    // Kept in localStorage so every tab of this browser sees it, like a real
    // browser's subscription.
    const make = () => ({
      endpoint: ep,
      options: { applicationServerKey: null },
      toJSON: () => ({ endpoint: ep, expirationTime: null, keys: { p256dh: key, auth: au } }),
      unsubscribe: async () => { localStorage.removeItem('fakePushSub'); return true; }
    });
    PushManager.prototype.subscribe = async function subscribe(options) {
      localStorage.setItem('fakePushSub', '1');
      return { ...make(), options };
    };
    PushManager.prototype.getSubscription = async function getSubscription() {
      return localStorage.getItem('fakePushSub') ? make() : null;
    };
  }, [aliceToken, endpoint, p256dh, auth]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const EN = locale('en');

  // 1. Turn it on in Settings -> Notifications.
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r && r.active)), null, { timeout: 15000 }).catch(() => {});
  await page.goto(`${WEB}/settings/notifications`, { waitUntil: 'networkidle' });
  const sw = page.getByRole('switch', { name: EN.notifSettings.push.title });
  await sw.waitFor({ timeout: 10000 }).catch(() => {});
  check('the push switch is offered (server has keys, browser supports push)', (await sw.count()) === 1);
  await sw.click();
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="notif-push-label"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 8000 }).catch(() => {});
  check('switch on', (await sw.getAttribute('aria-checked')) === 'true');
  check('server stored this browser for alice', sql(`SELECT user_id FROM push_subscriptions WHERE endpoint = '${endpoint}'`) === '1');
  await page.screenshot({ path: path.join(SP, 'day22-push-settings.png') });

  // 2. Bob likes her post -> a real, encrypted push reaches the push service.
  const form = new FormData();
  form.append('content', 'push me');
  const post = await (await fetch(`${API}/posts`, { method: 'POST', headers: { Authorization: `Bearer ${aliceToken}` }, body: form })).json();
  await fetch(`${API}/posts/${post.id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}` } });
  await settle();
  let got = await deliveries();
  check('a like -> one push delivered to her browser\'s push service', got.length === 1 && got[0].path === '/push/alice-browser', JSON.stringify(got));
  check('...encrypted (aes128gcm), signed (VAPID), with a TTL', got[0]?.encoding === 'aes128gcm' && got[0]?.vapid && Number(got[0]?.ttl) > 0 && got[0]?.size > 0);

  // 3. A message while she has the app open: no push. After she leaves: one.
  await fetch(`${API}/conversations/1/messages`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'are you there?' }) });
  await settle();
  check('a message while she is in the app: no push', (await deliveries()).length === 1);
  await page.close();
  await settle();
  await fetch(`${API}/conversations/1/messages`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'call me' }) });
  await settle();
  got = await deliveries();
  check('a message after she left: pushed', got.length === 2);

  // 4. The service worker shows it, and a tap opens the right page.
  const worker = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null));
  if (worker) {
    const shown = await worker.evaluate(async () => {
      const payload = { title: 'MySocialApp', body: 'bob sent you a message', url: '/messages/1', tag: 'conversation-1' };
      self.dispatchEvent(new PushEvent('push', { data: JSON.stringify(payload) }));
      await new Promise((r) => setTimeout(r, 500));
      const list = await self.registration.getNotifications({ tag: 'conversation-1' });
      return list.map((n) => ({ title: n.title, body: n.body, url: n.data && n.data.url }));
    });
    check('service worker: shows the notification with its text and link', JSON.stringify(shown) === JSON.stringify([{ title: 'MySocialApp', body: 'bob sent you a message', url: '/messages/1' }]), JSON.stringify(shown));
    const evil = await worker.evaluate(async () => {
      self.dispatchEvent(new PushEvent('push', { data: JSON.stringify({ title: 'x', body: 'y', url: 'https://evil.example/', tag: 't-evil' }) }));
      await new Promise((r) => setTimeout(r, 300));
      return (await self.registration.getNotifications({ tag: 't-evil' }))[0]?.data?.url;
    });
    check('service worker: keeps the link as data (a tap only ever opens this site)', evil === 'https://evil.example/');
  } else {
    check('service worker running', false);
  }

  // 5. Turning it off (or logging out) stops pushes to this browser.
  const back = await ctx.newPage();
  back.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await back.goto(`${WEB}/settings/notifications`, { waitUntil: 'networkidle' });
  const sw2 = back.getByRole('switch', { name: EN.notifSettings.push.title });
  await sw2.waitFor({ timeout: 10000 }).catch(() => {});
  await back.waitForFunction(() => document.querySelector('[aria-labelledby="notif-push-label"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 8000 }).catch(() => {});
  await sw2.click();
  await back.waitForTimeout(800);
  check('switch off -> the server forgets this browser', sql(`SELECT count(*) FROM push_subscriptions WHERE endpoint = '${endpoint}'`) === '0');
  await fetch(`${API}/posts/${post.id}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'nice' }) });
  await settle();
  check('...and nothing more is pushed to it', (await deliveries()).length === 2);

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nconsole/page errors:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  process.exit(results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
