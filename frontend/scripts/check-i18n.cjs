// `npm run check:i18n` (also runs in CI). B15, extended for B16 (Arabic).
//  1. Every locale file (en, my, ar, ...) has exactly the keys en.json has.
//     i18next plural suffixes (_zero/_one/_two/_few/_many/_other) count as
//     one key for this comparison.
//  2. Every plural key has every form its language's plural rules need
//     (Intl.PluralRules): English one/other, Myanmar other, Arabic all six.
//     A missing form would silently fall back to English text.
//  3. Every literal key the code uses -- t('a.b'), i18n.t('a.b'),
//     i18nKey="a.b", serverErrorText(err, 'a.b') -- exists in en.json.
//     Template keys like t(`menu.categories.${key}.title`) are checked by
//     their static prefix.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const LOCALES = path.join(SRC, 'i18n', 'locales');
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k) => k.replace(PLURAL, '');

const langs = fs.readdirSync(LOCALES).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
const keys = Object.fromEntries(langs.map((l) => [l, new Set(flat(JSON.parse(fs.readFileSync(path.join(LOCALES, `${l}.json`), 'utf8'))))]));
const bases = Object.fromEntries(langs.map((l) => [l, new Set([...keys[l]].map(base))]));
const enBase = bases.en;
const pluralBases = new Set([...keys.en].filter((k) => PLURAL.test(k)).map(base));

const problems = [];
for (const lang of langs) {
  if (lang === 'en') continue;
  for (const k of enBase) if (!bases[lang].has(k)) problems.push(`missing in ${lang}.json: ${k}`);
  for (const k of bases[lang]) if (!enBase.has(k)) problems.push(`not in en.json (${lang}.json): ${k}`);
}
for (const lang of langs) {
  const needed = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  for (const b of pluralBases) {
    for (const cat of needed) {
      if (!keys[lang].has(`${b}_${cat}`)) problems.push(`${lang}.json: plural "${b}" needs the _${cat} form`);
    }
  }
}

// Server-message translations (i18n/serverMessages.js): every language's
// table must cover the same English messages as the others.
{
  const code = fs.readFileSync(path.join(SRC, 'i18n', 'serverMessages.js'), 'utf8');
  const tables = {};
  for (const m of code.matchAll(/^const ([A-Z]{2}) = \{\n([\s\S]*?)\n\};/gm)) {
    tables[m[1]] = new Set([...m[2].matchAll(/^ {2}'((?:[^'\\]|\\.)+)':/gm)].map((x) => x[1]));
  }
  const names = Object.keys(tables);
  if (names.length < 2) problems.push('serverMessages.js: expected a table per translated language');
  for (const a of names) {
    for (const b of names) {
      for (const msg of tables[a]) if (!tables[b].has(msg)) problems.push(`serverMessages.js: ${b} is missing "${msg}"`);
    }
  }
}

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
  console.error(problems.slice(0, 50).join('\n') + (problems.length > 50 ? `\n... and ${problems.length - 50} more` : ''));
  console.error(`\ni18n check failed (${problems.length} problem${problems.length === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log(`i18n OK: ${langs.join(', ')} -- ${enBase.size} keys each, ${pluralBases.size} plural keys with every form, ${used} key references checked`);
