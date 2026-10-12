// Day 57: shrink a photo in the browser before it's uploaded -- phones take
// 12-50 MP pictures (several MB each) that the app never shows bigger than
// about 2000 px. Saves the person's data, upload time, and the free
// Cloudinary quota.
//
// A photo bigger than MAX_SIDE on its long side, or heavier than
// MAX_BYTES, is redrawn at most MAX_SIDE and re-encoded (WebP where the
// browser can, else JPEG). GIFs are left alone (they may be animated), as
// is anything the browser can't decode, and the original is kept whenever
// the result wouldn't be smaller. Never throws: on any problem the
// original file goes up, and the server's own limits still apply.
export const MAX_SIDE = 2048;
export const MAX_BYTES = 1024 * 1024;
const QUALITY = 0.85;
const RECODE = ['image/jpeg', 'image/png', 'image/webp'];

function toBlob(canvas, type) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, QUALITY);
  });
}

function renamed(name, type) {
  const base = String(name || 'photo').replace(/\.[^.]+$/, '');
  return `${base}.${type === 'image/webp' ? 'webp' : 'jpg'}`;
}

export async function compressImage(file) {
  try {
    if (!file || !RECODE.includes(file.type)) return file;
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    const longSide = Math.max(width, height);
    if (longSide <= MAX_SIDE && file.size <= MAX_BYTES) {
      bitmap.close?.();
      return file;
    }
    const scale = Math.min(1, MAX_SIDE / longSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // A transparent PNG drawn onto JPEG would go black: white behind it.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    let blob = await toBlob(canvas, 'image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg');
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], renamed(file.name, blob.type), { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}
