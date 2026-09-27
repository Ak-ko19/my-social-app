// B16: compare A3 screenshots against the pre-B16 baseline, pixel by pixel.
// Usage: node pixel-compare.cjs <baselineDir> <currentDir>
const fs = require('fs');
const path = require('path');
const { PNG } = require('./node_modules/playwright-core/lib/utilsBundle');
const [baseDir, curDir] = process.argv.slice(2);
const files = fs.readdirSync(baseDir).filter((f) => f.endsWith('.png')).sort();
let identical = 0;
const diffs = [];
for (const f of files) {
  const cp = path.join(curDir, f);
  if (!fs.existsSync(cp)) { diffs.push(`${f}: missing in current`); continue; }
  const a = PNG.sync.read(fs.readFileSync(path.join(baseDir, f)));
  const b = PNG.sync.read(fs.readFileSync(cp));
  if (a.width !== b.width || a.height !== b.height) { diffs.push(`${f}: size ${a.width}x${a.height} -> ${b.width}x${b.height}`); continue; }
  let changed = 0;
  let minY = Infinity;
  let maxY = -1;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
      changed += 1;
      const y = Math.floor(i / 4 / a.width);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (changed === 0) identical += 1;
  else diffs.push(`${f}: ${changed} px differ (rows ${minY}-${maxY})`);
}
console.log(`${identical}/${files.length} identical`);
diffs.forEach((d) => console.log('DIFF ' + d));
process.exit(diffs.length ? 1 : 0);
