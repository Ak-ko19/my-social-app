import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Day 58: scripts/check-rtl-css.cjs (part of `npm run check:i18n`) must
// keep catching CSS that breaks the right-to-left layout.
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'check-rtl-css.cjs');

function scan(css) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-css-'));
  try {
    fs.writeFileSync(path.join(dir, 'x.css'), css);
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    return { status: run.status, out: run.stdout + run.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('the right-to-left CSS scan', () => {
  it('catches physical sides, left / right alignment and one-way motion', () => {
    const { status, out } = scan(`.a {
  margin-left: 4px;
  left: 0;
  text-align: right;
  transform: translateX(8px);
  border-top-right-radius: 2px;
}
.b { float: left; color: red; }
`);
    expect(status).toBe(1);
    for (const found of ['margin-left: 4px', 'left: 0', 'text-align: right', 'translateX(8px)', 'border-top-right-radius', 'float: left']) {
      expect(out).toContain(found);
    }
    expect(out).toContain('6 problem(s)');
  });

  it('passes logical CSS, comments, [dir] overrides, translateX(0) and rtl-ok lines', () => {
    const { status, out } = scan(`.a {
  margin-inline-start: 4px;
  inset-inline-end: 0;
  text-align: start;
  transform: translateX(0);
  /* margin-left would be wrong here */
}
[dir='rtl'] .a { transform: translateX(-8px); margin-right: 2px; }
.c {
  transform: translateX(3px); /* rtl-ok: its twin is [dir='rtl'] .c */
}
`);
    expect(status).toBe(0);
    expect(out).toContain('logical everywhere');
  });
});
