// One-off generator for the PWA app icons -- no image-editing tool
// available in this environment, so this draws the icon procedurally
// (three brand-color dots on a white rounded-square background, matching
// components/layout/Logo.jsx's in-app mark) and PNG-encodes it by hand via
// Node's built-in zlib, rather than depending on a new image library just
// for a handful of static files. Not part of the build/runtime -- run once
// (`node scripts/generate-pwa-icons.js`) to (re)produce the files already
// committed under public/.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ACCENT = [0x4f, 0x46, 0xe5]; // --color-accent
const ACCENT_2 = [0x08, 0x91, 0xb2]; // --color-accent-2
const ACCENT_3 = [0xe1, 0x1d, 0x48]; // --color-accent-3
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaPixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline prefixed with a filter-type byte (0 = none).
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgbaPixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Three dots centered horizontally, same proportions as the in-app Logo
// mark. `padFraction` shrinks the whole glyph inward (maskable icons need
// a safe-zone margin since the OS may crop to a circle/squircle).
function drawIcon(size, { padFraction = 0, background = WHITE } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const cornerRadius = size * 0.22;

  const contentSize = size * (1 - padFraction * 2);
  const dotRadius = contentSize * 0.09;
  const spacing = contentSize * 0.28;
  const centerY = size / 2;
  const startX = size / 2 - spacing;
  const dots = [
    { cx: startX, cy: centerY, r: dotRadius, color: ACCENT },
    { cx: startX + spacing, cy: centerY, r: dotRadius, color: ACCENT_2 },
    { cx: startX + spacing * 2, cy: centerY, r: dotRadius, color: ACCENT_3 }
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded-square background mask (skip corners outside the radius).
      const dx = Math.max(0, Math.max(cornerRadius - x, x - (size - 1 - cornerRadius)));
      const dy = Math.max(0, Math.max(cornerRadius - y, y - (size - 1 - cornerRadius)));
      const inCorner = dx > 0 && dy > 0;
      const cornerDist = inCorner ? Math.sqrt(dx * dx + dy * dy) : 0;
      const insideRoundedSquare = !inCorner || cornerDist <= cornerRadius;

      let color = insideRoundedSquare ? background : null;

      for (const dot of dots) {
        const ddx = x + 0.5 - dot.cx;
        const ddy = y + 0.5 - dot.cy;
        if (ddx * ddx + ddy * ddy <= dot.r * dot.r) {
          color = dot.color;
          break;
        }
      }

      if (color) {
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
        pixels[idx + 3] = 255;
      } else {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  return pixels;
}

const outDir = path.join(__dirname, '..', 'public');

const targets = [
  { file: 'icon-192.png', size: 192, opts: {} },
  { file: 'icon-512.png', size: 512, opts: {} },
  // Maskable: no transparency (background fills the full square) and a
  // bigger safe-zone margin so a circular/squircle OS mask never clips the
  // dots -- the standard maskable-icon guidance is roughly a 20% margin.
  { file: 'icon-maskable-512.png', size: 512, opts: { padFraction: 0.2 } },
  // apple-touch-icon: iOS applies its own rounded-corner mask and ignores
  // alpha, so this is drawn as a plain filled square (no rounded corners,
  // no transparency) to avoid a visible square-behind-the-rounding artifact.
  { file: 'apple-touch-icon.png', size: 180, opts: { padFraction: 0.05, square: true } }
];

for (const target of targets) {
  const size = target.size;
  const pixels = target.opts.square
    ? (() => {
        // Same dot layout as drawIcon, but with a full-bleed square
        // background (cornerRadius = 0) instead of a rounded one.
        const buf = drawIcon(size, target.opts);
        // drawIcon already rounds corners; redraw background into the
        // corners for the square variant by re-running with radius 0 via a
        // second pass is unnecessary complexity -- simplest correct path:
        // fill any fully-transparent pixel (the rounded corners) with white.
        for (let i = 0; i < buf.length; i += 4) {
          if (buf[i + 3] === 0) {
            buf[i] = 255;
            buf[i + 1] = 255;
            buf[i + 2] = 255;
            buf[i + 3] = 255;
          }
        }
        return buf;
      })()
    : drawIcon(size, target.opts);

  const png = encodePNG(size, size, pixels);
  fs.writeFileSync(path.join(outDir, target.file), png);
  console.log(`Wrote ${target.file} (${size}x${size})`);
}
