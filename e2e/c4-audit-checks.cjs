// C4: audit checks that aren't covered by a feature browser suite.
// Needs the e2e stack up AND the demo seed loaded (thiri@demo.mysocialapp.test).
// Writes c4/audit-checks.json and prints PASS/FAIL lines.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('./node_modules/playwright-core');

const SP = __dirname;
const ROOT = path.resolve(__dirname, '..');
const API = 'http://localhost:3000';
const WEB = 'http://localhost:5173';
const out = { checks: [], routes: null, perf: [], npmAudit: {}, keepalive: null };
const check = (item, name, ok, extra = '') => {
  out.checks.push({ item, name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${item}] ${name}${extra ? '  -- ' + extra : ''}`);
};

(async () => {
  // ---------- A6: every route classified (parses multi-line router calls) ----------
  const PUBLIC_OK = new Set([
    'POST /signup', 'POST /login', 'POST /forgot-password', 'POST /reset-password/:token',
    'GET /verify-email/:token', 'GET /users/:id/follow-counts'
  ]);
  const routes = [];
  for (const f of fs.readdirSync(`${ROOT}/backend/routes`)) {
    const code = fs.readFileSync(`${ROOT}/backend/routes/${f}`, 'utf8');
    for (const m of code.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'([\s\S]*?)\);/g)) {
      const args = m[3];
      const kind = /authMiddleware|\.\.\.admin/.test(args) ? (/\.\.\.admin/.test(args) ? 'admin' : 'auth') : /optionalAuth/.test(args) ? 'optional' : 'public';
      routes.push({ file: f, method: m[1].toUpperCase(), path: m[2], kind });
    }
  }
  const unexpected = routes.filter((r) => r.kind === 'public' && !PUBLIC_OK.has(`${r.method} ${r.path}`));
  out.routes = { total: routes.length, byKind: routes.reduce((a, r) => ({ ...a, [r.kind]: (a[r.kind] || 0) + 1 }), {}), unexpectedPublic: unexpected };
  check('A6', `all ${routes.length} routes need a login, are admin-only, or are intentionally public/optional-auth`, unexpected.length === 0,
    JSON.stringify(out.routes.byKind) + (unexpected.length ? ' unexpected: ' + unexpected.map((r) => `${r.method} ${r.path}`).join(', ') : ''));
  const adminFile = fs.readFileSync(`${ROOT}/backend/routes/adminRoutes.js`, 'utf8');
  check('A6', 'admin routes use authMiddleware + requireAdmin', /const admin = \[authMiddleware, requireAdmin\]/.test(adminFile));

  // ---------- Phase 1 (static) ----------
  // Code lines only -- comments that explain the old fixes mention these names.
  const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);
  const codeMatches = (re) =>
    execSync(`grep -rnE "${re}" ${ROOT}/frontend/src --include=*.jsx --include=*.js || true`)
      .toString()
      .split('\n')
      .filter((l) => l && !isComment(l.replace(/^.*?:\d+:/, ''))); // "C:/path/file.js:24:code" -> "code"
  const mockUses = codeMatches('MOCK_STORIES|mockCurrentUser');
  check('Phase 1', 'no mock stories / mock current user left in the app (code, not comments)',
    mockUses.length === 0 && !fs.existsSync(`${ROOT}/frontend/src/data/mockCurrentUser.js`), mockUses.join(' | '));
  const serverCode = fs.readFileSync(`${ROOT}/backend/server.js`, 'utf8').split('\n').filter((l) => !isComment(l)).join('\n');
  check('Phase 1', 'server.js no longer serves /uploads (no static route in code)', !/\/uploads/.test(serverCode) && !/express\.static/.test(serverCode));
  const up = await fetch(`${API}/uploads/anything.png`);
  check('Phase 1', 'GET /uploads/... is 404', up.status === 404, String(up.status));

  // ---------- log in as the demo account ----------
  const login = await (await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'thiri@demo.mysocialapp.test', password: 'demo-password-123' }) })).json();
  const auth = { Authorization: `Bearer ${login.token}` };
  const unread = (await (await fetch(`${API}/notifications`, { headers: auth })).json()).notifications.filter((n) => !n.is_read).length;

  // ---------- Phase 1 (in the browser) ----------
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([t, id]) => {
    localStorage.setItem('token', t); localStorage.setItem('userId', String(id)); localStorage.setItem('username', 'thiri'); localStorage.setItem('emailVerified', 'true');
  }, [login.token, login.id]);
  const p = await ctx.newPage();
  await p.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  const bell = await p.getByRole('button', { name: /^Notifications/ }).getAttribute('aria-label');
  check('Phase 1', 'notification badge shows the real unread count', bell === `Notifications, ${unread} unread`, `${bell} (API: ${unread})`);
  check('Phase 1', 'no fake stories: the tray only shows real accounts', (await p.locator('.stories-item').count()) >= 1 && (await p.getByText('MOCK', { exact: false }).count()) === 0);
  await p.getByRole('button', { name: 'Search' }).click();
  await p.waitForURL(`${WEB}/search`);
  check('Phase 1', 'search reachable from the top bar', true);
  await p.goto(`${WEB}/menu`, { waitUntil: 'networkidle' });
  const menuName = await p.locator('.profile-summary-name').first().innerText();
  check('Phase 1', 'Menu shows the real logged-in user', menuName.trim() === 'thiri', menuName);
  await browser.close();

  // ---------- A6: response times on the demo data (median of 5, local) ----------
  const endpoints = ['/feed', '/posts', '/notifications', '/conversations', '/explore/posts', '/explore/hashtags', '/search/posts?q=yangon', '/communities', '/pages', `/users/${login.id}/posts?tab=posts`, `/posts/${(await (await fetch(`${API}/feed`, { headers: auth })).json()).posts[0].id}/comments`];
  for (const ep of endpoints) {
    const times = [];
    let status = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = await fetch(API + ep, { headers: auth });
      await r.arrayBuffer();
      status = r.status;
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    out.perf.push({ endpoint: ep, status, medianMs: Math.round(times[2]) });
  }
  const slow = out.perf.filter((x) => x.status !== 200 || x.medianMs > 300);
  check('A6', `main API endpoints answer 200 in under 300 ms locally (${endpoints.length} endpoints)`, slow.length === 0,
    out.perf.map((x) => `${x.endpoint.split('?')[0]} ${x.medianMs}ms`).join(', '));

  // ---------- A6: dependency vulnerabilities (production deps) ----------
  for (const pkg of ['backend', 'frontend']) {
    try {
      const raw = execSync('npm audit --omit=dev --json', { cwd: `${ROOT}/${pkg}`, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      out.npmAudit[pkg] = JSON.parse(raw).metadata.vulnerabilities;
    } catch (e) {
      // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
      try { out.npmAudit[pkg] = JSON.parse(e.stdout.toString()).metadata.vulnerabilities; } catch { out.npmAudit[pkg] = { error: 'npm audit unavailable' }; }
    }
    const v = out.npmAudit[pkg];
    check('A6', `${pkg}: no high/critical vulnerabilities in production dependencies`, !v.error && (v.high || 0) + (v.critical || 0) === 0, JSON.stringify(v));
  }

  // ---------- A5: the deployed backend's keep-alive endpoint (GET /, no DB) ----------
  try {
    const t0 = performance.now();
    const r = await fetch('https://my-social-app-ecjg.onrender.com/', { signal: AbortSignal.timeout(90000) });
    out.keepalive = { status: r.status, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    out.keepalive = { error: e.message };
  }
  check('A5', 'deployed backend answers the keep-alive ping', out.keepalive.status === 200, JSON.stringify(out.keepalive));

  fs.mkdirSync(path.join(SP, 'c4'), { recursive: true });
  fs.writeFileSync(path.join(SP, 'c4', 'audit-checks.json'), JSON.stringify(out, null, 2));
  process.exit(out.checks.some((c) => !c.ok) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
