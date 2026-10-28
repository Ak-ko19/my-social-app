// `npm run check:i18n` (also runs in CI). B15, extended for B16 (Arabic).
// Owner decision 2026-10-07: the UI languages are English and Arabic ONLY,
// and every feature ships fully translated in both.
//  0. The locale files are exactly en.json and ar.json (matching LANGUAGES
//     in src/i18n/index.js).
//  1. ar.json has exactly the keys en.json has. i18next plural suffixes
//     (_zero/_one/_two/_few/_many/_other) count as one key for this
//     comparison.
//  2. Every plural key has every form its language's plural rules need
//     (Intl.PluralRules): English one/other, Arabic all six.
//     A missing form would silently fall back to English text.
//  3. No Arabic string is just the English one copied over (except the
//     few that are only placeholders/addresses: SAME_OK).
//  4. Every message the backend can send a person (res.status(...).send,
//     { error } results, thrown XxxError(status, '...')) has an Arabic
//     translation in i18n/serverMessages.ar.js, unless DEV_ONLY says it is
//     developer-facing.
//  5. Every literal key the code uses -- t('a.b'), i18n.t('a.b'),
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
if (langs.join(',') !== 'ar,en') problems.push(`locales must be exactly en.json and ar.json (found: ${langs.join(', ')})`);
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

// 3. Arabic strings that are only placeholders, numbers or an address may
// equal the English ones; any other copy is an untranslated string.
const SAME_OK = new Set(['follow.buttonFor', 'poll.percent', 'editProfile.linkPlaceholder', 'pages.verification.linkPlaceholder']);
{
  const pairs = (o, p = '') =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? pairs(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
  const read = (l) => JSON.parse(fs.readFileSync(path.join(LOCALES, `${l}.json`), 'utf8'));
  const ar = new Map(pairs(read('ar')));
  for (const [k, v] of pairs(read('en'))) {
    if (ar.get(k) === v && /[A-Za-z]{2}/.test(v.replace(/\{\{[^}]*\}\}/g, '')) && !SAME_OK.has(k)) {
      problems.push(`ar.json: "${k}" is still the English text`);
    }
  }
}

// 3b. Day 103: a <Trans> tag named like an HTML void element (<link>,
// <img>, <br>, ...) can't hold text -- the parser closes it at once, so
// "Post by <link>{{name}}</link>" rendered an empty link and the name
// after it. Name such tags something else (<target>).
{
  const VOID = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
  const pattern = new RegExp(`<(${VOID.join('|')})>[^<]*</\\1>`);
  for (const l of ['en', 'ar']) {
    const all = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? all(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
    for (const [k, v] of all(JSON.parse(fs.readFileSync(path.join(LOCALES, `${l}.json`), 'utf8')))) {
      const m = typeof v === 'string' && v.match(pattern);
      if (m) problems.push(`${l}.json: "${k}" wraps text in <${m[1]}>, an HTML void element -- it renders empty; use another tag name`);
    }
  }
}

// 4. Server messages (i18n/serverMessages.ar.js) against what the backend sends.
// DEV_ONLY: messages the UI never lets a person trigger -- API field names
// (lowercase start or a camelCase field), lists built at run time, internal
// routes and the link-preview fetcher's own reasons.
const DEV_ONLY_FILES = new Set(['internalRoutes.js', 'clientErrorRoutes.js', 'linkPreviewService.js', 'pushText.js', 'emailText.js']);
const DEV_ONLY = new Set([
  'Send true/false for any of: ${notificationService.CATEGORIES.join(\', \')}',
  'Sort must be recent or top',
  'Invalid cursor',
  'An audio file is required (field name "audio")',
  'An image file is required (field name "image")',
  'A valid http(s) url is required',
  'Poll length must be one of: ${DURATION_HOURS.join(\', \')} hours',
  'Invalid ${name}' // postCreationService: "Invalid communityId" / "Invalid pageId"
]);
const isDevOnly = (msg) => DEV_ONLY.has(msg) || /^[a-z]/.test(msg) || /\b[a-z]+[A-Z]\w*/.test(msg) || /\.join\(/.test(msg);
{
  const code = fs.readFileSync(path.join(SRC, 'i18n', 'serverMessages.ar.js'), 'utf8');
  const table = code.match(/^const AR = \{\n([\s\S]*?)\n\};/m);
  const translated = new Set(
    table ? [...table[1].matchAll(/^ {2}(['"])((?:(?!\1)[^\\]|\\.)+)\1:/gm)].map((m) => m[2].replace(/\\(['"])/g, '$1')) : []
  );
  if (!table) problems.push('serverMessages.ar.js: no AR table');
  const FAILED = / failed\. Please try again later\.$/; // the generic translation covers these
  const BACKEND = path.join(__dirname, '..', '..', 'backend');
  const SENT = [
    /\.status\(\d{3}\)\s*\.(?:send|json)\(\s*(?:\{\s*(?:error|message):\s*)?(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
    /new (?!Error\()[A-Z]\w*Error\(\s*(?:\d{3},\s*)?(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
    /\b(?:message|error):\s*(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g,
    /sendServerError\([^,]+,[^,]+,\s*(')((?:[^'\\]|\\.)*)'/g,
    // Day 75: a message kept in a constant (`const ONLY_IMAGES = 'Only ...';`)
    // and sent from there -- otherwise its Arabic could go missing unseen.
    // A sentence: a capital, a lower-case letter and a space (not 'GET' or
    // the app's name).
    /\bconst [A-Z][A-Z0-9_]* = (['"])([A-Z][a-z](?=[^'"\n]* )(?:(?!\1)[^\\]|\\.)*)\1;/g
  ];
  const sources = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', 'tests', 'scripts', 'migrations'].includes(e.name) && !e.name.startsWith('.')) walk(p);
      } else if (e.name.endsWith('.js')) {
        sources.push({ name: e.name, src: fs.readFileSync(p, 'utf8') });
      }
    }
  })(BACKEND);
  // `const NAME = 123;` -- a number constant, in this file or (when it is
  // imported) defined once with that value anywhere in the backend.
  const NUMBER_CONST = /\bconst ([A-Z][A-Z0-9_]*) = (\d+);/g;
  const shared = new Map();
  for (const { src } of sources) {
    for (const [, name, value] of src.matchAll(NUMBER_CONST)) shared.set(name, shared.has(name) && shared.get(name) !== value ? null : value);
  }
  let scanned = 0;
  for (const { name: file, src } of sources) {
    if (DEV_ONLY_FILES.has(file)) continue;
    const local = new Map([...src.matchAll(NUMBER_CONST)].map(([, name, value]) => [name, value]));
    const resolve = (msg) => msg.replace(/\$\{(\w+)\}/g, (whole, name) => local.get(name) ?? shared.get(name) ?? whole);
    for (const re of SENT) {
      for (const m of src.matchAll(re)) {
        const raw = m[2].replace(/\\(['"])/g, '$1');
        if (!raw || isDevOnly(raw)) continue;
        const msg = resolve(raw);
        scanned += 1;
        if (msg.includes('${')) problems.push(`backend ${file}: "${raw}" -- add the constant's value or a DEV_ONLY entry`);
        else if (!translated.has(msg) && !FAILED.test(msg)) problems.push(`serverMessages.ar.js: no Arabic for "${msg}" (backend ${file})`);
      }
    }
  }
  if (scanned < 100) problems.push(`backend scan found only ${scanned} messages -- is ../backend missing?`);
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
      // t('help.sections', { returnObjects: true }) names a whole object or
      // list (Day 60): fine when en.json has keys under it.
      const wholeObject = /^[^)]*returnObjects:\s*true/.test(code.slice(m.index + m[0].length, m.index + m[0].length + 80));
      const found = enBase.has(m[1]) || (wholeObject && [...enBase].some((k) => k.startsWith(`${m[1]}.`)));
      if (!found) problems.push(`${rel}: unknown key '${m[1]}'`);
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
