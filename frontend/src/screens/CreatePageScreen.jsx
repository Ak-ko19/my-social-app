import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { categoryLabel, createPage, PAGE_CATEGORIES } from '../services/pageService';
import { serverErrorText } from '../utils/serverError';
import './GroupsScreen.css';

// B14: /pages/new
function CreatePageScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('business');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    createPage({ name: name.trim(), category, description }, token)
      .then((p) => navigate(`/pages/${p.id}`, { replace: true }))
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'pages.createFailed'));
        setSubmitting(false);
      });
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('pages.backToPages')} onClick={() => navigate('/pages')} />
        <h1 className="screen-header-title">{t('pages.createTitle')}</h1>
      </header>
      <form className="screen-body form-stack" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">{t('pages.name')}</span>
          <input className="form-input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pages.namePlaceholder')} required />
        </label>
        <label className="form-field">
          <span className="form-label">{t('pages.category')}</span>
          <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {PAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">{t('pages.aboutOptional')}</span>
          <textarea className="form-input" rows="3" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('pages.aboutPlaceholder')} />
        </label>
        <p className="group-privacy-hint">{t('pages.publicHint')}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim() || submitting}>
          {submitting ? t('pages.creating') : t('pages.createTitle')}
        </button>
      </form>
    </div>
  );
}

export default CreatePageScreen;
