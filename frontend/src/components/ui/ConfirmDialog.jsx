import { useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';

// Shared confirm-before-you-act dialog -- block/unblock, delete post,
// deactivate account, and (with `requireTypedConfirmation`) delete account
// all render through this instead of the browser's native window.confirm(),
// which can't be styled, can't show a danger variant, and (unlike this)
// blocks the whole tab while open.
function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  requireTypedConfirmation, // e.g. a username -- confirm stays disabled until typed exactly
  error,
  children // Day 50: an extra choice under the description (e.g. "Also ban them")
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [typedValue, setTypedValue] = useState('');

  const canConfirm = !requireTypedConfirmation || typedValue === requireTypedConfirmation;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
      setTypedValue('');
    }
  };

  const handleClose = () => {
    setTypedValue('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={title} className="ui-confirm-dialog">
      <h2 className="ui-confirm-title">{title}</h2>
      {description && <p className="ui-confirm-description">{description}</p>}
      {children}
      {requireTypedConfirmation && (
        <input
          type="text"
          className="ui-confirm-input"
          value={typedValue}
          onChange={(e) => setTypedValue(e.target.value)}
          placeholder={t('common.typeToConfirm', { text: requireTypedConfirmation })}
          aria-label={t('common.typeToConfirmLabel', { text: requireTypedConfirmation })}
          autoComplete="off"
        />
      )}
      {error && (
        <p className="ui-confirm-error" role="alert">
          {error}
        </p>
      )}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-confirm-btn ui-confirm-btn-secondary" onClick={handleClose} disabled={pending}>
          {cancelLabel || t('common.cancel')}
        </button>
        <button
          type="button"
          className={`ui-confirm-btn ${danger ? 'ui-confirm-btn-danger' : 'ui-confirm-btn-primary'}`}
          onClick={handleConfirm}
          disabled={pending || !canConfirm}
        >
          {pending ? t('common.pleaseWait') : confirmLabel || t('common.confirm')}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
