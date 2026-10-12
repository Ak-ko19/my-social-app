// Day 58: CSS that would break the Arabic (right-to-left) layout -- runs
// inside `npm run check:i18n`. The app uses logical properties (margin-
// inline-start, inset-inline-end, text-align: start...) so everything
// mirrors by itself; this fails on the physical ones creeping back in:
//   - margin / padding / border -left / -right, left: / right:,
//     border-*-left/right-radius;
//   - text-align or float: left / right;
//   - translateX (motion has a direction: it needs an RTL counterpart).
// Allowed: rules whose selector is an [dir='rtl'] / [dir="ltr"] override,
// and lines marked /* rtl-ok: why */ (e.g. a keyframe that has an RTL
// twin, or code text that is always left-to-right).
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'src');
const PHYSICAL = [
  [/^\s*(margin|padding|border)-(left|right)(-\w+)?\s*:/, 'use the -inline-start / -inline-end form'],
  [/^\s*(left|right)\s*:/, 'use inset-inline-start / inset-inline-end'],
  [/^\s*border-(top|bottom)-(left|right)-radius\s*:/, 'use border-start-start-radius and friends'],
  [/^\s*(text-align|float)\s*:\s*(left|right)\b/, 'use start / end'],
  // translateX(0) has no direction.
  [/translateX\((?!0\))/, 'motion needs an RTL counterpart ([dir=\'rtl\'] rule), then mark it rtl-ok']
];

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return files(full);
    return e.name.endsWith('.css') ? [full] : [];
  });
}

const problems = [];
for (const file of files(SRC)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let selector = '';
  let inComment = false;
  lines.forEach((raw, i) => {
    // Comments are text, not rules (a comment may well say "left").
    let line = raw;
    if (inComment) {
      const end = line.indexOf('*/');
      if (end === -1) return;
      line = line.slice(end + 2);
      inComment = false;
    }
    const marked = /rtl-ok/.test(raw);
    line = line.replace(/\/\*.*?\*\//g, '');
    if (line.includes('/*')) {
      inComment = true;
      line = line.slice(0, line.indexOf('/*'));
    }
    if (line.includes('{')) selector = line.slice(0, line.indexOf('{'));
    const override = /\[dir=['"]?(rtl|ltr)['"]?\]/.test(selector);
    if (marked || override) return;
    // Each declaration on the line (a one-line rule has several, after "{").
    const declarations = (line.includes('{') ? line.slice(line.indexOf('{') + 1) : line).split(';');
    for (const declaration of declarations) {
      for (const [pattern, fix] of PHYSICAL) {
        if (pattern.test(declaration)) problems.push(`${path.relative(SRC, file).replace(/\\/g, '/')}:${i + 1}: "${declaration.replace('}', '').trim()}" -- ${fix}`);
      }
    }
  });
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\nright-to-left CSS: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('right-to-left CSS: logical everywhere');
