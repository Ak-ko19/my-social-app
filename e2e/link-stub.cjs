// A tiny "website" for the link preview suites (Day 19). The backend may
// fetch it only because e2e-up.sh sets LINK_PREVIEW_TEST_ORIGIN to it
// (honoured outside production only). Started by e2e-up.sh.
//   node link-stub.cjs [port=3902]
const http = require('http');

const PAGES = {
  '/article': `<!doctype html><html><head>
    <meta property="og:site_name" content="Daily Example">
    <meta property="og:title" content="Rain expected across the region this weekend">
    <meta property="og:description" content="Forecasters say heavy rain will reach the coast by Saturday evening.">
    <meta property="og:image" content="https://example.com/should-never-be-loaded.jpg">
    <title>Weather</title></head><body>…</body></html>`,
  '/myanmar': `<!doctype html><html><head>
    <meta property="og:title" content="မြန်မာ သတင်း ခေါင်းစဉ်">
    <meta name="description" content="ရန်ကုန်မြို့တွင် မိုးရွာနိုင်သည်">
    </head></html>`,
  '/plain': '<!doctype html><html><body>no title, no description</body></html>'
};

const PORT = Number(process.argv[2] || 3902);
http.createServer((req, res) => {
  const page = PAGES[req.url];
  if (!page) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<title>Not found</title>');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(PORT, '127.0.0.1', () => console.log(`link stub on ${PORT}`));
