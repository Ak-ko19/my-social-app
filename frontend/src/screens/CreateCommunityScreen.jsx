import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Globe, Lock } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { createCommunity } from '../services/communityService';
import { serverErrorText } from '../utils/serverError';
import './GroupsScreen.css';

// B13: /groups/new
function CreateCommunityScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    createCommunity({ name: name.trim(), description, privacy }, token)
      .then((g) => navigate(`/groups/${g.id}`, { replace: true }))
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'groups.createFailed'));
        setSubmitting(false);
      });
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('groups.backToGroups')} onClick={() => navigate('/groups')} />
        <h1 className="screen-header-title">{t('groups.createTitle')}</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">{t('groups.name')}</span>
          <input className="form-input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('groups.namePlaceholder')} required />
        </label>
        <label className="form-field">
          <span className="form-label">{t('groups.descriptionOptional')}</span>
          <textarea className="form-input" rows="3" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('groups.descriptionPlaceholder')} />
        </label>
        <fieldset className="audience-picker">
          <legend className="form-label">{t('groups.privacy')}</legend>
          <label className={privacy === 'public' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="privacy" value="public" checked={privacy === 'public'} onChange={() => setPrivacy('public')} />
            <Globe size={15} aria-hidden="true" /> {t('groups.public')}
          </label>
          <label className={privacy === 'private' ? 'audience-option is-selected' : 'audience-option'}>
            <input type="radio" name="privacy" value="private" checked={privacy === 'private'} onChange={() => setPrivacy('private')} />
            <Lock size={15} aria-hidden="true" /> {t('groups.private')}
          </label>
        </fieldset>
        <p className="group-privacy-hint">{privacy === 'public' ? t('groups.publicHint') : t('groups.privateHint')}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim() || submitting}>
          {submitting ? t('groups.creating') : t('groups.createTitle')}
        </button>
      </form>
    </div>
  );
}

export default CreateCommunityScreen;
