import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui';
import { serverErrorText } from '../../utils/serverError';
import './PostNotificationsButton.css';

const LEVELS = ['all', 'highlights', 'off'];

// Day 101: the bell next to Leave (a group) or Following (a page) --
// which of its new posts you hear about: All posts / Highlights / Off,
// like Facebook. `kind` is 'group' or 'page' (the wording of Highlights
// differs); onSave(level) saves it and resolves, or rejects with the
// server's reason. The choice shows at once and goes back if saving fails.
function PostNotificationsButton({ kind, name, level, onSave }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // What was picked here (until the parent's `level` catches up).
  const [shown, setShown] = useState(null);
  const current = shown ?? level;

  const choose = async (next) => {
    if (saving || next === current) return;
    const before = current;
    setShown(next);
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch (err) {
      console.error(err);
      setShown(before);
      setError(serverErrorText(err, 'postNotifications.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const Icon = current === 'off' ? BellOff : Bell;
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary post-notif-btn"
        aria-label={t('postNotifications.button', { level: t(`postNotifications.levels.${current}`) })}
        title={t('postNotifications.button', { level: t(`postNotifications.levels.${current}`) })}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon size={18} aria-hidden="true" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('postNotifications.title', { name })}>
        <fieldset className="post-notif-choices" disabled={saving}>
          <legend className="post-notif-legend">{t(`postNotifications.legend.${kind}`)}</legend>
          {LEVELS.map((value) => (
            <label key={value} className={value === current ? 'post-notif-option is-selected' : 'post-notif-option'}>
              <input type="radio" name="post-notifications" value={value} checked={value === current} onChange={() => choose(value)} />
              <span className="post-notif-text">
                <span className="post-notif-label">{t(`postNotifications.levels.${value}`)}</span>
                <span className="post-notif-hint">{t(`postNotifications.hints.${kind}.${value}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="post-notif-actions">
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
            {t('common.done')}
          </button>
        </div>
      </Modal>
    </>
  );
}

export default PostNotificationsButton;
