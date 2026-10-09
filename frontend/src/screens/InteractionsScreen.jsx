import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/ui';
import FeedErrorState from '../components/feed/FeedErrorState';
import { useAuth } from '../hooks/useAuth';
import api from '../api';
import { serverErrorText } from '../utils/serverError';
import './InteractionsScreen.css';

const MESSAGE_OPTIONS = ['everyone', 'following', 'nobody'];
const COMMENT_OPTIONS = ['everyone', 'followers', 'following'];
const headers = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Day 47: Settings -> Messages and comments: who can message you, and who
// can comment on your posts. Saved as soon as you pick.
function InteractionsScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [values, setValues] = useState(null); // { message_permission, comment_permission }
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api.get('/profile/me', headers(token))
      .then((res) => setValues({ message_permission: res.data.message_permission, comment_permission: res.data.comment_permission }))
      .catch(() => setLoadFailed(true));
  };
  useEffect(load, [token]);

  const save = async (field, value) => {
    const previous = values;
    setValues({ ...values, [field]: value });
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const body = field === 'message_permission' ? { messagePermission: value } : { commentPermission: value };
      setValues((await api.put('/profile/interactions', body, headers(token))).data);
      setStatus(t('interactions.saved'));
    } catch (err) {
      setValues(previous);
      setError(serverErrorText(err, 'interactions.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const group = (field, options, legendKey, hintKey) => (
    <fieldset className="interactions-group" disabled={saving}>
      <legend className="section-heading">{t(legendKey)}</legend>
      {options.map((option) => (
        <label key={option} className={values[field] === option ? 'interactions-option is-selected' : 'interactions-option'}>
          <input type="radio" name={field} value={option} checked={values[field] === option} onChange={() => save(field, option)} />
          <span>{t(`interactions.${field === 'message_permission' ? 'message' : 'comment'}.${option}`)}</span>
        </label>
      ))}
      <p className="form-hint">{t(hintKey)}</p>
    </fieldset>
  );

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">{t('interactions.title')}</h1>
      </header>
      <div className="screen-body">
        {loadFailed && <FeedErrorState message={t('interactions.loadFailed')} onRetry={() => { setLoadFailed(false); load(); }} />}
        {!loadFailed && !values && <p className="screen-status" role="status">{t('common.loading')}</p>}
        {values && (
          <>
            {group('message_permission', MESSAGE_OPTIONS, 'interactions.messageLegend', 'interactions.messageHint')}
            {group('comment_permission', COMMENT_OPTIONS, 'interactions.commentLegend', 'interactions.commentHint')}
          </>
        )}
        <p className="interactions-status" role="status">{status}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export default InteractionsScreen;
