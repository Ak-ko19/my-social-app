// Day 27: what a first visit downloads -- the built index.html's entry
// script, every chunk it preloads, and its stylesheets -- must stay within
// a budget (gzipped, as it goes over the wire). Everything else (each
// screen, the Myanmar/Arabic translations, the live-chat client) loads
// on demand and must stay out of that first download.
// Run after `npm run build` (CI does). Usage: node scripts/check-bundle.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// About 212 kB on Day 27; the headroom allows normal growth, not a new
// library on every page (code-split it instead, like the screens).
const BUDGET_KB = 225;

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('check:bundle: dist/index.html not found -- run `npm run build` first.');
  process.exit(1);
}
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const problems = [];
let total = 0;
for (const file of files) {
  const code = fs.readFileSync(path.join(dist, file));
  total += zlib.gzipSync(code, { level: 9 }).length;
  if (/^assets\/(my|ar)-/.test(file)) problems.push(`${file}: a translation is in the first download (it should load when picked).`);
  if (code.includes('/socket.io')) problems.push(`${file}: the live-chat client is in the first download (it loads after login, see SocketProvider).`);
}
const kb = total / 1024;
if (kb > BUDGET_KB) problems.push(`the first download is ${kb.toFixed(1)} kB gzipped, over the ${BUDGET_KB} kB budget.`);

if (problems.length > 0) {
  console.error(`check:bundle failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`bundle OK: first download ${kb.toFixed(1)} kB gzipped (budget ${BUDGET_KB} kB), ${files.length} files`);
