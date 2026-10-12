// Day 58: UI text that skips t() -- runs inside `npm run check:i18n`.
// check-i18n.cjs proves every key exists in English and Arabic; this proves
// the screens use keys. It parses every .jsx under src (with ESLint's own
// parser) and reports:
//   - JSX text with letters in it ("<p>Loading…</p>"),
//   - aria-label / placeholder / title / alt (and our components' text
//     props) given as a string with letters (aria-label="Close"),
//   - setError('...') and similar setters given a string with letters.
// Not checked: test files; strings that aren't words (symbols, numbers,
// "·"); ALLOWED, the few that are the same in every language; and any
// element marked data-i18n="skip" (with what's inside it) -- text that
// isn't UI, like the bot honeypot or a sample username.
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const { KEYS } = require('eslint-visitor-keys');

// The folder to scan: src, or one given on the command line (to test it).
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'src');
// Native attributes, and the props our components show as text
// (ConfirmDialog's description / confirmLabel, a field's label...).
const ATTRIBUTES = new Set(['aria-label', 'aria-description', 'placeholder', 'title', 'alt',
  'label', 'description', 'message', 'confirmLabel', 'cancelLabel', 'emptyText', 'heading']);
// setError('...'), setStatus('...'), setMessage('...'): text for the screen.
const TEXT_SETTER = /^set\w*(Error|Status|Message|Notice|Hint)$/;
// A Latin or Arabic letter: in UI text it means words a person reads.
const LETTER = /[A-Za-z؀-ۿ]/;
// The same in every language.
const ALLOWED = new Set(['MySocialApp']);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return files(full);
    return e.name.endsWith('.jsx') && !/\.test\.jsx$/.test(e.name) ? [full] : [];
  });
}

const skipped = (node) => node.type === 'JSXElement' && node.openingElement.attributes.some(
  (a) => a.type === 'JSXAttribute' && a.name.name === 'data-i18n' && a.value?.value === 'skip'
);

function walk(node, visit) {
  if (!node || typeof node.type !== 'string' || skipped(node)) return;
  visit(node);
  for (const key of KEYS[node.type] || []) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, visit));
    else walk(child, visit);
  }
}

const problems = [];
for (const file of files(SRC)) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true });
  } catch (err) {
    problems.push(`${path.relative(SRC, file)}: could not parse (${err.message})`);
    continue;
  }
  const where = (node) => `${path.relative(SRC, file).replace(/\\/g, '/')}:${node.loc.start.line}`;
  walk(ast, (node) => {
    if (node.type === 'JSXText') {
      const text = node.value.replace(/\s+/g, ' ').trim();
      if (text && LETTER.test(text) && !ALLOWED.has(text)) problems.push(`${where(node)}: text "${text}" -- use t()`);
    }
    if (node.type === 'JSXAttribute' && ATTRIBUTES.has(node.name.name) && node.value?.type === 'Literal') {
      const text = String(node.value.value).trim();
      if (text && LETTER.test(text) && !ALLOWED.has(text)) problems.push(`${where(node)}: ${node.name.name}="${text}" -- use t()`);
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && TEXT_SETTER.test(node.callee.name)) {
      const arg = node.arguments[0];
      // A single camelCase word is a state ('loading', 'success'), not text.
      const isState = /^[a-z]+(?:[A-Z][a-z0-9]*)*$/.test(arg?.value);
      if (arg?.type === 'Literal' && typeof arg.value === 'string' && LETTER.test(arg.value) && !isState) {
        problems.push(`${where(node)}: ${node.callee.name}('${arg.value}') -- use t()`);
      }
    }
  });
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\nhardcoded UI text: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('hardcoded UI text: none');
