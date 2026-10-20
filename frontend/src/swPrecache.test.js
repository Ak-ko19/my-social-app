import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { PLACEHOLDER, injectPrecache, precacheList } from '../vite-plugins/swPrecache.js';

// Day 75: the build writes its scripts and styles into sw.js.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('service worker precache list (vite-plugins/swPrecache.js)', () => {
  it("keeps the build's scripts and styles, not fonts, html or other files", () => {
    expect(precacheList([
      'index.html', 'assets/index-a1.js', 'assets/index-b2.css', 'assets/Messages-c3.js',
      'assets/noto-sans-arabic-400-d4.woff2', 'assets/x-e5.woff', 'sw.js', 'assets/nested/odd.js',
    ])).toEqual(['/assets/Messages-c3.js', '/assets/index-a1.js', '/assets/index-b2.css']);
  });

  it('writes the list into the real public/sw.js, once', () => {
    const source = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
    expect(source.split(PLACEHOLDER)).toHaveLength(2);
    const built = injectPrecache(source, ['/assets/a.js', '/assets/b.css']);
    expect(built).toContain('const PRECACHE = ["/assets/a.js","/assets/b.css"];');
    expect(built).not.toContain(PLACEHOLDER);
  });

  it('fails the build if sw.js lost its placeholder (rather than ship a worker with nothing to cache)', () => {
    expect(() => injectPrecache('const PRECACHE = ["/x.js"];', [])).toThrow(/no longer contains/);
  });
});
