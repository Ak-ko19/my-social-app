import clsx from 'clsx';
import { getAvatarSources } from '../../utils/cloudinaryImage';

// Circular avatar. Falls back to initials-on-color when no `src` is given.
// `ring` is either a boolean (true -> var(--color-accent)) or any CSS color
// string, rendered as a two-layer box-shadow (a surface-colored gap, then
// the ring) so it reads as a ring around the circle rather than just a
// thicker border -- the "active story" look. `badge` is any node (e.g. a
// lucide <Plus/>) overlaid bottom-right, for things like the "+" on
// "Your story". Day 27: a Cloudinary `src` is fetched cropped to `size`
// (1x/2x/3x) and lazily, not as the original upload. Day 75: `decorative`
// is for an avatar inside a control whose label says what it does (e.g.
// "Add to your story"): it is hidden from assistive tech, and its initials
// are drawn by CSS rather than being text -- otherwise "AL" counts as the
// control's visible label, which speech-input users would have to say.
function Avatar({
  src,
  alt = '',
  initials,
  decorative = false,
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
      {...(decorative && { 'aria-hidden': true })}
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
      ) : decorative ? (
        <span className="ui-avatar-initials" data-initials={initials} />
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
