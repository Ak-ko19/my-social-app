import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { ConfirmDialog, IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import { categoryLabel, deletePage, fetchPage, PAGE_CATEGORIES, updatePage } from '../services/pageService';
import { serverErrorText } from '../utils/serverError';
import './GroupsScreen.css';

// B14: /pages/:id/edit -- owner only (the API enforces it too).
function EditPageScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams();
  const { token } = useAuth();
  const [page, setPage] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPage(id, token)
      .then((p) => {
        if (cancelled) return;
        setPage(p);
        setForm({ name: p.name, category: p.category, description: p.description || '' });
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(t('pages.editLoadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, token, reloadKey, t]);

  const header = (
    <header className="screen-header">
      <IconButton icon={ChevronLeft} aria-label={t('pages.backToPage')} onClick={() => navigate(`/pages/${id}`)} />
      <h1 className="screen-header-title">{t('pages.edit')}</h1>
    </header>
  );

  if (error) {
    return (
      <div className="screen-enter">
        {header}
        <FeedErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }
  if (!page || !form) return <p className="screen-status" role="status">{t('common.loading')}</p>;
  if (!page.is_owner) {
    return (
      <div className="screen-enter">
        {header}
        <p className="screen-status">{t('pages.ownerOnly')}</p>
      </div>
    );
  }

  const save = (e) => {
    e.preventDefault();
    setSaveError('');
    setSaved(false);
    updatePage(id, form, token)
      .then((p) => {
        setPage(p);
        // The saved text, which can differ (Day 43: Zawgyi -> Unicode).
        setForm({ name: p.name, category: p.category, description: p.description || '' });
        setSaved(true);
      })
      .catch((err) => {
        console.error(err);
        setSaveError(serverErrorText(err, 'pages.saveFailed'));
      });
  };

  const remove = () => {
    setDeleteError('');
    deletePage(id, token)
      .then(() => navigate('/pages', { replace: true }))
      .catch((err) => {
        console.error(err);
        setDeleteError(t('pages.deleteFailed'));
      });
  };

  return (
    <div className="screen-enter">
      {header}
      <form className="screen-body form-stack" onSubmit={save}>
        <label className="form-field">
          <span className="form-label">{t('pages.name')}</span>
          <input className="form-input" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="form-field">
          <span className="form-label">{t('pages.category')}</span>
          <select className="form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {PAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">{t('pages.about')}</span>
          <textarea className="form-input" rows="3" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!form.name.trim()}>{t('common.saveChanges')}</button>
        {saved && <p className="form-success" role="status">{t('common.saved')}</p>}

        <h2 className="section-heading">{t('pages.dangerZone')}</h2>
        <button type="button" className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>{t('pages.deletePage')}</button>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t('pages.deleteTitle', { name: page.name })}
        description={t('pages.deleteText')}
        confirmLabel={t('pages.deletePage')}
        danger
        requireTypedConfirmation={page.name}
        error={deleteError}
      />
    </div>
  );
}

export default EditPageScreen;
