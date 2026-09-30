// Stands in for Cloudflare's Turnstile siteverify endpoint in the browser
// suites (the backend's TURNSTILE_VERIFY_URL points here; honoured outside
// production only). A token is valid when it is "human-ok" and the secret
// matches the stack's test secret. Started by e2e-up.sh with E2E_TURNSTILE=1.
//   node turnstile-stub.cjs [port=3901]
const http = require('http');

const PORT = Number(process.argv[2] || 3901);
http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch { /* invalid -> fails below */ }
    const success = req.method === 'POST' && req.url === '/siteverify'
      && parsed.secret === 'e2e-turnstile-secret' && parsed.response === 'human-ok';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(success ? { success: true } : { success: false, 'error-codes': ['invalid-input-response'] }));
  });
}).listen(PORT, () => console.log(`turnstile stub on ${PORT}`));
