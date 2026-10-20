import fs from 'node:fs';
import path from 'node:path';

// Day 75: the service worker (public/sw.js) caches the build's own scripts
// and styles when it installs, so every screen opens offline -- not just the
// ones visited before going offline. A screen is a lazily loaded file of its
// own, and which files a screen needs is the bundler's choice (Vite 8.3
// split Messages into new ones, and opening it offline broke). The list is
// written into the built sw.js in place of PLACEHOLDER, so sw.js changes with
// every build that changes a file, and browsers install the new worker.
// Fonts are left out: there are 56 subset files and a browser only ever
// loads the few it needs (they are cached when first used).
export const PLACEHOLDER = 'const PRECACHE = [];';

export function precacheList(fileNames) {
  return fileNames
    .filter((name) => /^assets\/[^/]+\.(js|css)$/.test(name))
    .map((name) => `/${name}`)
    .sort();
}

export function injectPrecache(source, files) {
  if (!source.includes(PLACEHOLDER)) {
    throw new Error(`sw-precache: public/sw.js no longer contains "${PLACEHOLDER}"`);
  }
  return source.replace(PLACEHOLDER, `const PRECACHE = ${JSON.stringify(files)};`);
}

export function swPrecache() {
  let outDir;
  let files = [];
  return {
    name: 'sw-precache',
    apply: 'build',
    generateBundle(options, bundle) {
      outDir = options.dir;
      files = precacheList(Object.keys(bundle));
    },
    // After the public folder (and so sw.js) has been copied to outDir.
    closeBundle() {
      const sw = path.join(outDir, 'sw.js');
      fs.writeFileSync(sw, injectPrecache(fs.readFileSync(sw, 'utf8'), files));
    },
  };
}
