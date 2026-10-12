import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage, MAX_SIDE } from './compressImage';

// Day 57: shrinking photos before upload. jsdom has no image decoding, so
// createImageBitmap and the canvas are stand-ins that record what's drawn.
const fileOf = (bytes, type = 'image/jpeg', name = 'IMG_0001.jpg') => new File([new Uint8Array(bytes)], name, { type });
let drawn;
let encodeAs; // what the "browser" can encode: types it supports
let outBytes;

beforeEach(() => {
  drawn = null;
  encodeAs = ['image/webp', 'image/jpeg'];
  outBytes = 300 * 1024;
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') return realCreate(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ fillRect: vi.fn(), set fillStyle(v) {}, drawImage: (img, x, y, w, h) => { drawn = { w, h }; } }),
      toBlob: (cb, type) => cb(encodeAs.includes(type) ? new Blob([new Uint8Array(outBytes)], { type }) : new Blob([new Uint8Array(outBytes)], { type: 'image/png' }))
    };
    return canvas;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compressImage', () => {
  it('a big phone photo: at most 2048 px, as WebP, smaller, renamed', async () => {
    const out = await compressImage(fileOf(4 * 1024 * 1024));
    expect(drawn).toEqual({ w: MAX_SIDE, h: 1536 });
    expect(out.type).toBe('image/webp');
    expect(out.name).toBe('IMG_0001.webp');
    expect(out.size).toBe(300 * 1024);
  });

  it('JPEG where the browser can\'t make WebP', async () => {
    encodeAs = ['image/jpeg'];
    const out = await compressImage(fileOf(4 * 1024 * 1024, 'image/png', 'shot.png'));
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('shot.jpg');
  });

  it('heavy but not large: re-encoded at its own size', async () => {
    createImageBitmap.mockResolvedValueOnce({ width: 1200, height: 900, close: vi.fn() });
    await compressImage(fileOf(2 * 1024 * 1024));
    expect(drawn).toEqual({ w: 1200, h: 900 });
  });

  it('left alone: small enough, a GIF, a non-image, or when the result is no smaller', async () => {
    createImageBitmap.mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() });
    const small = fileOf(200 * 1024);
    expect(await compressImage(small)).toBe(small);
    const gif = fileOf(4 * 1024 * 1024, 'image/gif', 'cat.gif');
    expect(await compressImage(gif)).toBe(gif);
    const audio = fileOf(1000, 'audio/webm', 'note.webm');
    expect(await compressImage(audio)).toBe(audio);
    outBytes = 5 * 1024 * 1024;
    const big = fileOf(4 * 1024 * 1024);
    expect(await compressImage(big)).toBe(big);
  });

  it('never throws: anything going wrong sends the original', async () => {
    createImageBitmap.mockRejectedValueOnce(new Error('cannot decode'));
    const broken = fileOf(4 * 1024 * 1024);
    expect(await compressImage(broken)).toBe(broken);
    vi.unstubAllGlobals(); // a browser without createImageBitmap
    const old = fileOf(4 * 1024 * 1024);
    expect(await compressImage(old)).toBe(old);
    expect(await compressImage(null)).toBeNull();
  });
});
