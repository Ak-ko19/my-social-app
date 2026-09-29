// GO LIVE rehearsal API smoke (see golive-rehearsal.sh): a backend running on
// the migrated production-shaped DB must serve old (014-era) data and new actions.
//   node golive-smoke.cjs <baseUrl> <new|old>
// Seeded 014-era users have placeholder password hashes, so user 1 (thiri)
// is reached with a JWT signed with the rehearsal server's own secret.
const jwt = require(require('path').join(__dirname, '..', 'backend', 'node_modules', 'jsonwebtoken'));

const [API, mode] = process.argv.slice(2);
const SECRET = 'rehearsal-only-secret';
const thiri = jwt.sign({ userId: 1 }, SECRET, { expiresIn: '1h' });
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  [${mode}] ${name}${extra ? '  -- ' + extra : ''}`);
const call = async (method, path, token, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, json, text };
};

(async () => {
  const name = `rehearse${Date.now() % 100000}`;
  const signup = await call('POST', '/signup', null, { username: name, email: `${name}@example.com`, password: 'a-fine-password-123' });
  check('signup', signup.status === 201, signup.text.slice(0, 80));
  const login = await call('POST', '/login', null, { email: `${name}@example.com`, password: 'a-fine-password-123' });
  check('login', login.status === 200);
  const me = login.json?.token;

  check('follow an existing (014-era) user', [200, 201].includes((await call('POST', '/users/1/follow', me)).status));
  const feed = await call('GET', '/feed', me);
  const posts = feed.json?.posts || [];
  const old = posts.find((p) => p.content.startsWith('Shwedagon'));
  check('feed shows the old post', feed.status === 200 && Boolean(old), `status ${feed.status}`);
  if (mode === 'new') {
    check('old post keeps its image (017 backfill)', old?.media?.length === 1 && old.media[0].url.endsWith('/posts/p1.jpg'));
    check('old likes count as reactions (016)', old?.like_count === 2);
  } else {
    check('old post keeps its image_url', old?.image_url?.endsWith('/posts/p1.jpg'));
  }

  const created = await call('POST', '/posts', me, { content: `hello from ${mode} code` });
  check('create a post', created.status === 201, created.text.slice(0, 80));
  check('like / react to the old post', [200, 201].includes((await call('POST', `/posts/${old?.id}/like`, me)).status));
  check('comment on the old post', (await call('POST', `/posts/${old?.id}/comments`, me, { content: 'nice' })).status === 201);
  const comments = await call('GET', `/posts/${old?.id}/comments`, me);
  const list = Array.isArray(comments.json) ? comments.json : comments.json?.comments || [];
  check('old comments still listed', comments.status === 200 && list.some((c) => c.content === 'Beautiful!'));

  const convs = await call('GET', '/conversations', thiri);
  const conv = (Array.isArray(convs.json) ? convs.json : convs.json?.conversations || [])[0];
  const convId = conv?.conversation_id ?? conv?.id;
  check('old DM conversation listed', convs.status === 200 && Boolean(convId));
  const msgs = await call('GET', `/conversations/${convId}/messages`, thiri);
  const mlist = Array.isArray(msgs.json) ? msgs.json : msgs.json?.messages || [];
  check('old text + voice messages readable', msgs.status === 200 && mlist.some((m) => m.type === 'voice' && m.media_url) && mlist.some((m) => m.content === 'မင်္ဂလာပါ'));
  check('send a new DM', (await call('POST', `/conversations/${convId}/messages`, thiri, { content: `from ${mode} code` })).status === 201);

  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
