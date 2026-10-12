import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Day 58: scripts/check-hardcoded-text.cjs (part of `npm run check:i18n`)
// must keep finding UI text that skips t() -- a broken scanner would
// quietly pass everything. (The samples use t(key), not literal keys, so
// check-i18n doesn't read them as real ones.)
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'check-hardcoded-text.cjs');

function scan(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcoded-'));
  try {
    for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), code);
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    return { status: run.status, out: run.stdout + run.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('the hardcoded-text scan', () => {
  it('finds text, attributes, component props and setters that skip t(), in any script', () => {
    const { status, out } = scan({
      'Bad.jsx': `export default function Bad({ t, setError, setStatus }) {
  setError('Something broke');
  setStatus('success');
  return (<div>
    <p>Loading…</p>
    <button aria-label="Close">×</button>
    <img alt="A cat" />
    <ConfirmDialog description="Are you sure?" confirmLabel={t(key)} />
    <p>تحميل</p>
    <span>·</span>
  </div>);
}`
    });
    expect(status).toBe(1);
    for (const found of ["setError('Something broke')", 'text "Loading…"', 'aria-label="Close"', 'alt="A cat"', 'description="Are you sure?"', 'text "تحميل"']) {
      expect(out).toContain(found);
    }
    expect(out).not.toContain("setStatus('success')"); // a state, not text
    expect(out).not.toContain('"·"');
    expect(out).toContain('6 problem(s)');
  });

  it('passes t() text, data-i18n="skip" and test files', () => {
    const { status, out } = scan({
      'Good.jsx': `export default ({ t }) => (<div>
  <p>{t(key)}</p>
  <input placeholder={t(key)} />
  <div data-i18n="skip"><b>sample</b></div>
</div>);`,
      'Good.test.jsx': 'export const x = <p>Only in a test</p>;'
    });
    expect(status).toBe(0);
    expect(out).toContain('none');
  });
});
