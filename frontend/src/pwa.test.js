import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Day 72: the installable app's files -- manifest, icons, service worker.
const ROOT = path.resolve(__dirname, '..');
const pub = (file) => path.join(ROOT, 'public', file.replace(/^\//, ''));
const manifest = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'));

function png(file) {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const colorType = b[25];
  const idat = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o);
    if (b.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  return { width, height, colorType, raw: zlib.inflateSync(Buffer.concat(idat)) };
}

describe('PWA files', () => {
  it('the manifest names the app, starts at / and opens standalone', () => {
    expect(manifest).toMatchObject({ id: '/', name: 'MySocialApp', start_url: '/', scope: '/', display: 'standalone' });
    expect(manifest.description.length).toBeLessThanOrEqual(120);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('every manifest icon exists at its declared size; there is a 192, a 512 and a maskable one', () => {
    for (const icon of manifest.icons) {
      const { width, height } = png(pub(icon.src));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('the maskable icon is a full, opaque tile (launchers cut it to their own shape)', () => {
    const icon = manifest.icons.find((i) => i.purpose === 'maskable');
    const { colorType, raw, width } = png(pub(icon.src));
    if (colorType === 2) return; // RGB: no transparency at all
    expect(colorType).toBe(6);
    const stride = 1 + width * 4;
    for (let y = 0; y < width; y += 1) {
      expect(raw[y * stride]).toBe(0); // unfiltered rows, so alpha can be read directly
      for (let x = 0; x < width; x += 1) expect(raw[y * stride + 1 + x * 4 + 3]).toBe(255);
    }
  });

  it("the iPhone's home-screen icon is 180x180", () => {
    expect(png(pub('apple-touch-icon.png'))).toMatchObject({ width: 180, height: 180 });
  });

  it('every file the service worker precaches exists', () => {
    const sw = fs.readFileSync(pub('sw.js'), 'utf8');
    const shell = JSON.parse(sw.match(/const APP_SHELL = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
    for (const file of shell) {
      const where = file === '/' || file === '/index.html' ? path.join(ROOT, 'index.html') : pub(file);
      expect(fs.existsSync(where)).toBe(true);
    }
  });
});
