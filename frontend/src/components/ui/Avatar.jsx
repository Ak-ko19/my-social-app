import clsx from 'clsx';
import { getAvatarSources } from '../../utils/cloudinaryImage';

// Circular avatar. Falls back to initials-on-color when no `src` is given.
// `ring` is either a boolean (true -> var(--color-accent)) or any CSS color
// string, rendered as a two-layer box-shadow (a surface-colored gap, then
// the ring) so it reads as a ring around the circle rather than just a
// thicker border -- the "active story" look. `badge` is any node (e.g. a
// lucide <Plus/>) overlaid bottom-right, for things like the "+" on
// "Your story". Day 27: a Cloudinary `src` is fetched cropped to `size`
// (1x/2x/3x) and lazily, not as the original upload.
function Avatar({
  src,
  alt = '',
  initials,
  size = 40,
  bg = 'var(--color-subtle-bg)',
  color = 'var(--color-text)',
  ring = false,
  badge,
  className,
  ...rest
}) {
  const ringColor = ring === true ? 'var(--color-accent)' : ring || null;

  return (
    <span
      className={clsx('ui-avatar', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        boxShadow: ringColor ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${ringColor}` : undefined,
        ...(src ? null : { background: bg, color })
      }}
      {...rest}
    >
      {src ? (
        <img
          className="ui-avatar-image"
          {...getAvatarSources(src, size)}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
        />
      ) : initials}
      {badge && (
        <span className="ui-avatar-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </span>
  );
}

export default Avatar;
