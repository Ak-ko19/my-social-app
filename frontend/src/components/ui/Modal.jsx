import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

// What Tab can land on inside the dialog.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Generic centered overlay + panel -- the one modal primitive every
// confirm dialog / reason-picker / form-in-a-modal in the app builds on
// (ConfirmDialog wraps this; ReportDialog, the account-deletion
// type-to-confirm step, etc. use it directly), so backdrop/Escape/focus
// behavior only has to be gotten right once.
// variant 'center' (default) is a centered card, used by ConfirmDialog and
// form-style dialogs. variant 'sheet' slides up from the bottom edge, used
// by ActionSheet (the post "more options" / report-reason menu) -- the
// mobile-native pattern for a list of actions, as opposed to a form.
function Modal({ open, onClose, title, children, className, variant = 'center' }) {
  const panelRef = useRef(null);
  // Callers usually pass a new onClose function on every render. Depending
  // on it below re-ran the effect -- and re-focused the panel -- on every
  // keystroke in a field inside the dialog, so only one letter could be
  // typed (Day 13, found by a component test). The latest onClose lives in
  // a ref instead; the effect only runs when the dialog opens or closes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    // Day 58: where focus was (the button that opened this) -- it goes back
    // there on close, so a keyboard or screen-reader user keeps their place.
    const opener = document.activeElement;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Day 58: Tab and Shift+Tab stay inside the dialog (aria-modal says
      // the page behind can't be used, so focus mustn't wander there).
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[inert]'));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = panelRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Focus the panel so Escape/Tab work immediately without requiring a
    // click first, and so screen readers land inside the dialog.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`ui-modal-backdrop ${variant === 'sheet' ? 'ui-modal-backdrop-sheet' : ''}`}
          role="presentation"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`ui-modal-panel ${variant === 'sheet' ? 'ui-modal-panel-sheet' : ''} ${className || ''}`}
            onClick={(e) => e.stopPropagation()}
            initial={variant === 'sheet' ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={variant === 'sheet' ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={variant === 'sheet' ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: DURATION_FAST, ease: EASE_STANDARD }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default Modal;
