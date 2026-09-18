import { resolveImageUrl } from '../../api';
import { getOptimizedImageUrl } from '../../utils/cloudinaryImage';

// Generic enough to reuse anywhere an avatar is shown (feed, profile,
// notifications, messages) — takes a raw avatar_url and resolves it itself.
// Requests a size close to the actual on-screen size (2x for retina)
// instead of whatever resolution the user originally uploaded.
function Avatar({ src, alt = '', size = 32, className = '' }) {
  const resolved = resolveImageUrl(src);
  if (!resolved) return null;

  return (
    <img
      className={`feed-avatar ${className}`.trim()}
      src={getOptimizedImageUrl(resolved, size * 2)}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
    />
  );
}

export default Avatar;
