import clsx from 'clsx';

// Plain <p>, not a heading -- an "eyebrow" label over a grouped list isn't
// necessarily a real section heading in the document outline, and forcing
// an h-level here could clash with whatever heading structure the page
// housing it already has. Callers who do want it as a real heading can
// wrap it themselves.
function SectionLabel({ children, className, ...rest }) {
  return (
    <p className={clsx('ui-section-label', className)} {...rest}>
      {children}
    </p>
  );
}

export default SectionLabel;
