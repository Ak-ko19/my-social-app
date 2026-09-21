import clsx from 'clsx';
import './layout.css';

// Three colored dots + the wordmark. Its own component because it repeats
// on Home's TopAppBar, and again on the Menu/Settings screens -- imports
// layout.css itself (not just relying on whatever else happens to have
// already loaded it) so its styles are present even on a screen that
// doesn't mount TopAppBar.
function Logo({ className }) {
  return (
    <span className={clsx('ui-logo', className)}>
      <span className="ui-logo-dots" aria-hidden="true">
        <span className="ui-logo-dot" style={{ background: 'var(--color-accent)' }} />
        <span className="ui-logo-dot" style={{ background: 'var(--color-accent-2)' }} />
        <span className="ui-logo-dot" style={{ background: 'var(--color-accent-3)' }} />
      </span>
      <span className="ui-logo-wordmark">MySocialApp</span>
    </span>
  );
}

export default Logo;
