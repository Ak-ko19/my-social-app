import clsx from 'clsx';

// 36px rounded-square icon button. Pass a lucide-react icon COMPONENT
// (not an instance) via `icon`, e.g. <IconButton icon={Bell} .../> -- or
// pass fully custom content via `children` instead.
//
// This is icon-only by construction, so the caller MUST pass a real
// `aria-label` (there's no visible text for a screen reader to fall back
// on otherwise) -- there's no default here to enforce that, since this
// project doesn't use prop-types/TypeScript anywhere to validate it at
// build time.
function IconButton({ icon: Icon, iconSize = 18, badgeCount, className, children, ...rest }) {
  return (
    <button type="button" className={clsx('ui-icon-btn', className)} {...rest}>
      {Icon ? <Icon size={iconSize} aria-hidden="true" /> : children}
      {badgeCount > 0 && (
        <span className="ui-icon-btn-badge" aria-hidden="true">
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </button>
  );
}

export default IconButton;
