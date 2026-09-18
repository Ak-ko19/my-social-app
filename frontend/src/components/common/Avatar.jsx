import { resolveImageUrl } from '../../api';

// Generic enough to reuse anywhere an avatar is shown (feed, profile,
// notifications, messages) — takes a raw avatar_url and resolves it itself.
function Avatar({ src, alt = '', size = 32, className = '' }) {
  const resolved = resolveImageUrl(src);
  if (!resolved) return null;

  return (
    <img
      className={`feed-avatar ${className}`.trim()}
      src={resolved}
      alt={alt}
      width={size}
      height={size}
    />
  );
}

export default Avatar;
