// Stands in for a browser push service (FCM/Mozilla/Apple) in the push
// suite (Day 22). The backend may send to it only because e2e-up.sh sets
// PUSH_TEST_ENDPOINT_ORIGIN (honoured outside production only). It records
// each delivery's headers and size; GET /deliveries lists them. A path
// ending in /gone answers 410 like an expired subscription.
//   node push-stub.cjs [port=3903]
const http = require('http');

const PORT = Number(process.argv[2] || 3903);
const deliveries = [];
http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/deliveries') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(deliveries));
    return;
  }
  let size = 0;
  req.on('data', (chunk) => { size += chunk.length; });
  req.on('end', () => {
    deliveries.push({
      path: req.url,
      ttl: req.headers.ttl,
      encoding: req.headers['content-encoding'],
      vapid: /^vapid t=[^,]+, k=/.test(req.headers.authorization || ''),
      size
    });
    res.writeHead(req.url.endsWith('/gone') ? 410 : 201);
    res.end();
  });
}).listen(PORT, '127.0.0.1', () => console.log(`push stub on ${PORT}`));
