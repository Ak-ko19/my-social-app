const fs = require('fs');
const path = require('path');

// Day 68: docs/REALTIME.md lists exactly the Socket.IO events the server
// listens to and emits (both ways), and the web app only listens to events
// the server really sends.
const BACKEND = path.join(__dirname, '../..');
const doc = fs.readFileSync(path.join(BACKEND, 'docs/REALTIME.md'), 'utf8');

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'tests' ? [] : sources(full);
    return /\.jsx?$/.test(entry.name) ? [fs.readFileSync(full, 'utf8')] : [];
  });
}
const names = (texts, re) => [...new Set(texts.flatMap((t) => [...t.matchAll(re)].map((m) => m[1])))].sort();
// The first column of each table section: | `event` | ...
const documented = (heading) => {
  const section = doc.split(/^## /m).find((part) => part.startsWith(heading));
  return [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]).sort();
};

describe('docs/REALTIME.md', () => {
  const backend = ['controllers', 'services', 'sockets', 'routes'].flatMap((dir) => sources(path.join(BACKEND, dir)));
  const listens = names(sources(path.join(BACKEND, 'sockets')), /socket\.on\('([a-z_]+)'/g);
  const emits = names(backend, /\.emit\('([a-z_]+)'/g);

  it('"You send" is every event the server listens to', () => {
    expect(listens.length).toBeGreaterThan(5);
    expect(documented('You send')).toEqual(listens);
  });

  it('"You receive" is every event the server emits', () => {
    expect(emits.length).toBeGreaterThan(8);
    expect(documented('You receive')).toEqual(emits);
  });

  it('the web app listens only to events the server emits', () => {
    const app = names(sources(path.join(BACKEND, '../frontend/src')), /socket\.on\('([a-z_]+)'/g);
    expect(app.filter((event) => !emits.includes(event) && event !== 'connect' && event !== 'disconnect')).toEqual([]);
  });
});
