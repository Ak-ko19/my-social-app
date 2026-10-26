import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui';
import { MAX_ALT_LENGTH } from '../../utils/textLimits';

// Day 95: "Describe this photo" -- the alt text screen readers read instead
// of "Photo 2 of 3" (Instagram's and X's "Alt text"). `n` is the photo's
// number in the post, `initial` its description so far. onSave(text) gets
// the trimmed text ('' removes it). Mounted only while open, so it starts
// from `initial` every time.
function AltTextDialog({ n, initial, onSave, onClose }) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial || '');
  const save = (value) => {
    onSave(value.trim());
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={t('compose.altTitle', { n })} className="ui-confirm-dialog alt-text-dialog">
      <h2 className="ui-confirm-title">{t('compose.altTitle', { n })}</h2>
      <p className="ui-confirm-description" id={`alt-help-${n}`}>{t('compose.altHelp', { max: MAX_ALT_LENGTH })}</p>
      <label className="form-label" htmlFor={`alt-text-${n}`}>{t('compose.altLabel')}</label>
      <textarea
        id={`alt-text-${n}`}
        className="share-dialog-words"
        aria-describedby={`alt-help-${n}`}
        // Any language keeps its own direction (B16).
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_ALT_LENGTH}
        rows={4}
      />
      <div className="ui-confirm-actions">
        {initial && (
          <button type="button" className="ui-confirm-btn ui-confirm-btn-secondary" onClick={() => save('')}>
            {t('compose.altRemove')}
          </button>
        )}
        <button type="button" className="ui-confirm-btn ui-confirm-btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="ui-confirm-btn ui-confirm-btn-primary" onClick={() => save(text)}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  );
}

export default AltTextDialog;
