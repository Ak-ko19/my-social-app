import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DURATION_FAST, EASE_STANDARD } from '../../utils/motionTokens';

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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    // Focus the panel so Escape/Tab work immediately without requiring a
    // click first, and so screen readers land inside the dialog.
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
