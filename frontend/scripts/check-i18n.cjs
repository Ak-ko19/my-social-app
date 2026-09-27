// B15: `npm run check:i18n` (also runs in CI).
//  1. en.json and my.json have exactly the same keys. i18next plural
//     suffixes (_one/_other/...) count as one key, since Myanmar only uses
//     _other while English needs _one too.
//  2. Every literal key the code uses -- t('a.b'), i18n.t('a.b'),
//     i18nKey="a.b", serverErrorText(err, 'a.b') -- exists in en.json.
//     Template keys like t(`menu.categories.${key}.title`) are checked by
//     their static prefix.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const load = (lang) => JSON.parse(fs.readFileSync(path.join(SRC, 'i18n', 'locales', `${lang}.json`), 'utf8'));
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k) => k.replace(PLURAL, '');

const en = new Set(flat(load('en')));
const my = new Set(flat(load('my')));
const enBase = new Set([...en].map(base));
const myBase = new Set([...my].map(base));

const problems = [];
for (const k of enBase) if (!myBase.has(k)) problems.push(`missing in my.json: ${k}`);
for (const k of myBase) if (!enBase.has(k)) problems.push(`missing in en.json: ${k}`);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|cjs)$/.test(e.name)) files.push(p);
  }
})(SRC);

const LITERAL = [
  // t('x') and i18n.t('x') -- one pattern, so i18n.t isn't counted twice.
  /(?<![\w$])(?:i18n\.)?t\(\s*'([a-zA-Z0-9_.-]+)'/g,
  /i18nKey="([a-zA-Z0-9_.-]+)"/g,
  /serverErrorText\([^,]+,\s*'([a-zA-Z0-9_.-]+)'/g
];
const TEMPLATE = /\bt\(\s*`([a-zA-Z0-9_.-]+)\$\{/g;
let used = 0;
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  for (const re of LITERAL) {
    for (const m of code.matchAll(re)) {
      used += 1;
      if (!enBase.has(m[1])) problems.push(`${rel}: unknown key '${m[1]}'`);
    }
  }
  for (const m of code.matchAll(TEMPLATE)) {
    used += 1;
    if (![...enBase].some((k) => k.startsWith(m[1]))) problems.push(`${rel}: no keys start with '${m[1]}'`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\ni18n check failed (${problems.length} problem${problems.length === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log(`i18n OK: ${enBase.size} keys in both languages, ${used} key references checked`);
