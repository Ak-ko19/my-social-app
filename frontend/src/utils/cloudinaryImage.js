// Centralizes Cloudinary delivery-URL transformations so every image
// consumer (PostCard's media, Avatar, ...) asks for optimized images the same way,
// in one place, instead of hand-building transform strings per component.
//
// This only rewrites the delivery URL Cloudinary already returned at upload
// time (stored as posts.image_url / users.avatar_url) -- no secrets are
// involved (Cloudinary transformation segments are a public part of the
// delivery URL by design) and nothing is re-uploaded or stored again.
const UPLOAD_MARKER = '/upload/';

export function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes(UPLOAD_MARKER);
}

function withTransformation(url, transformation) {
  if (!isCloudinaryUrl(url) || !transformation) return url;
  return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}${transformation}/`);
}

// f_auto / q_auto let Cloudinary pick the best format (e.g. WebP/AVIF where
// the browser supports it) and compression level automatically. `width`
// requests a size close to how large the image will actually render
// on-screen instead of shipping the original upload; c_limit means it will
// downscale but never upscale past the original. A no-op for the legacy
// `/uploads/...` local paths that predate the Cloudinary migration -- those
// aren't Cloudinary URLs, so they're returned unchanged.
export function getOptimizedImageUrl(url, width) {
  const parts = ['f_auto', 'q_auto'];
  if (width) parts.push(`w_${Math.round(width)}`, 'c_limit');
  return withTransformation(url, parts.join(','));
}

// Tiny, heavily blurred, low-quality version used as an LQIP-style
// placeholder while the optimized image above is still loading.
export function getPlaceholderImageUrl(url) {
  return withTransformation(url, 'f_auto,q_1,w_32,e_blur:1000');
}

// Day 27: a `srcset` of the same image at several widths, so the browser
// downloads the one that fits the screen (a 390px phone at 3x gets ~1170px,
// a desktop column 480px at 1x). null for non-Cloudinary URLs.
export function getSrcSet(url, widths) {
  if (!isCloudinaryUrl(url)) return null;
  return widths.map((w) => `${getOptimizedImageUrl(url, w)} ${w}w`).join(', ');
}

// Day 27: a square, centre-cropped avatar at `size` CSS pixels, with 2x and
// 3x versions for sharp screens (an uploaded avatar can be several MB).
// Returns { src, srcSet }; non-Cloudinary URLs come back unchanged.
export function getAvatarSources(url, size) {
  if (!isCloudinaryUrl(url)) return { src: url, srcSet: undefined };
  const at = (px) => withTransformation(url, `f_auto,q_auto,w_${px},h_${px},c_fill`);
  return { src: at(size * 2), srcSet: `${at(size)} 1x, ${at(size * 2)} 2x, ${at(size * 3)} 3x` };
}
