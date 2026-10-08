import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, Plus } from 'lucide-react';
import { Modal } from '../ui';
import { resolveImageUrl } from '../../api';
import { getOptimizedImageUrl } from '../../utils/cloudinaryImage';
import { serverErrorText } from '../../utils/serverError';
import { fetchCollections, createCollection, MAX_COLLECTION_NAME } from '../../services/collectionService';
import './CollectionsRow.css';

// Day 46: your collections at the top of Saved, like Instagram's -- a
// cover (the newest saved photo in it), the name and how many posts, and a
// "New collection" card first.
function CollectionsRow({ token }) {
  const { t } = useTranslation();
  const [collections, setCollections] = useState(null); // null = loading
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchCollections(token)
      .then(setCollections)
      .catch(() => setLoadFailed(true));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const closeForm = () => {
    setCreating(false);
    setName('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const made = await createCollection(name.trim(), token);
      setCollections((list) => [made, ...(list || [])]);
      closeForm();
    } catch (err) {
      setError(serverErrorText(err, 'collections.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="collections-row" aria-labelledby="collections-heading">
      <h2 id="collections-heading" className="collections-heading">{t('collections.title')}</h2>
      {loadFailed ? (
        <p className="collections-status">
          {t('collections.loadListFailed')}{' '}
          <button type="button" className="screen-link collections-retry" onClick={() => { setLoadFailed(false); load(); }}>{t('common.retry')}</button>
        </p>
      ) : (
        <ul className="collections-list" aria-busy={collections === null}>
          <li>
            <button type="button" className="collection-card collection-card-new" onClick={() => setCreating(true)}>
              <span className="collection-cover collection-cover-empty"><Plus size={28} aria-hidden="true" /></span>
              <span className="collection-name">{t('collections.new')}</span>
            </button>
          </li>
          {collections === null && [0, 1].map((i) => <li key={i} className="collection-card collection-card-skeleton" aria-hidden="true" />)}
          {collections?.map((c) => (
            <li key={c.id}>
              <Link to={`/saved/collections/${c.id}`} className="collection-card">
                {c.cover_url
                  ? <img className="collection-cover" src={getOptimizedImageUrl(resolveImageUrl(c.cover_url), 200)} alt="" loading="lazy" />
                  : <span className="collection-cover collection-cover-empty"><Bookmark size={24} aria-hidden="true" /></span>}
                <span className="collection-name" dir="auto">{c.name}</span>
                <span className="collection-count">{t('collections.posts', { count: c.post_count })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={closeForm} title={t('collections.newTitle')} className="collections-new-dialog">
        <form onSubmit={submit} className="form-stack">
          <h2 className="ui-confirm-title">{t('collections.newTitle')}</h2>
          <label className="form-field">
            <span className="form-label">{t('collections.nameLabel')}</span>
            <input
              className="form-input"
              value={name}
              maxLength={MAX_COLLECTION_NAME}
              placeholder={t('collections.newPlaceholder')}
              onChange={(e) => setName(e.target.value)}
              dir="auto"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="collections-form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>{t('collections.create')}</button>
            <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={busy}>{t('common.cancel')}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

export default CollectionsRow;
