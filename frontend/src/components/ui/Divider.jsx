import clsx from 'clsx';

// <hr> is the semantically correct element for this (a thematic break),
// not a styled <div>.
function Divider({ inset = false, className, ...rest }) {
  return <hr className={clsx('ui-divider', inset && 'ui-divider-inset', className)} {...rest} />;
}

export default Divider;
