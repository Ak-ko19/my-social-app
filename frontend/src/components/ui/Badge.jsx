import clsx from 'clsx';

// Small pill label. No built-in assumption about what it's for -- an
// unread count and a "Sponsored" tag both just pass different
// bg/color/children; defaults are a neutral gray tag look.
function Badge({ children, bg = 'var(--color-subtle-bg)', color = 'var(--color-text-muted)', className, ...rest }) {
  return (
    <span className={clsx('ui-badge', className)} style={{ background: bg, color }} {...rest}>
      {children}
    </span>
  );
}

export default Badge;
