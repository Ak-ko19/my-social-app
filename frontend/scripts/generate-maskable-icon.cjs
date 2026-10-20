// Day 72: draws public/icon-maskable-512.png -- the app's three dots on a
// solid, full-bleed white tile. A maskable icon must have no transparency:
// launchers cut it to their own shape (circle, squircle...) and expect the
// whole square to be filled; only the middle 80% (the "safe zone") is sure
// to show, so the dots stay well inside it. Plain Node (zlib), no image
// library: a 4x supersampled render, averaged down for smooth edges.
//   node scripts/generate-maskable-icon.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const SS = 4; // supersampling
const BACKGROUND = [255, 255, 255];
// The same three dots as the other icons (icon-512.png), a little smaller.
const DOTS = [
  { x: 170, color: [0x4f, 0x46, 0xe5] },
  { x: 256, color: [0x08, 0x91, 0xb2] },
  { x: 342, color: [0xe1, 0x1d, 0x48] }
];
const RADIUS = 28;
const Y = 256;

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const rows = [];
for (let y = 0; y < SIZE; y += 1) {
  const row = Buffer.alloc(1 + SIZE * 3); // filter byte 0, then RGB
  for (let x = 0; x < SIZE; x += 1) {
    const sum = [0, 0, 0];
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        const dot = DOTS.find((d) => (px - d.x) ** 2 + (py - Y) ** 2 <= RADIUS ** 2);
        const c = dot ? dot.color : BACKGROUND;
        for (let i = 0; i < 3; i += 1) sum[i] += c[i];
      }
    }
    for (let i = 0; i < 3; i += 1) row[1 + x * 3 + i] = Math.round(sum[i] / (SS * SS));
  }
  rows.push(row);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 2; // colour type: RGB, no alpha -- opaque by construction
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
const out = path.join(__dirname, '..', 'public', 'icon-maskable-512.png');
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
