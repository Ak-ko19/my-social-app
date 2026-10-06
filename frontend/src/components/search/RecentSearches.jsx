import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, X } from 'lucide-react';
import { ConfirmDialog, IconButton } from '../ui';
import { clearSearchHistory, deleteSearch, fetchSearchHistory } from '../../services/searchService';
import './RecentSearches.css';

// Day 42: the signed-in person's recent searches, before they search. A tap
// searches again; the X removes one; Clear all (after a confirm) removes
// them all. Removing is instant and undone, with a message, if the server
// refuses. Nothing shows for visitors or with no history.
function RecentSearches({ token, onPick }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetchSearchHistory(token)
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => console.error(err));
    return () => { cancelled = true; };
  }, [token]);

  const remove = (item) => {
    setError('');
    const before = items;
    setItems((list) => list.filter((s) => s.id !== item.id));
    deleteSearch(item.id, token).catch((err) => {
      console.error(err);
      setItems(before);
      setError(t('search.recentFailed'));
    });
  };

  const clearAll = async () => {
    setError('');
    const before = items;
    setItems([]);
    setConfirmOpen(false);
    try {
      await clearSearchHistory(token);
    } catch (err) {
      console.error(err);
      setItems(before);
      setError(t('search.recentFailed'));
    }
  };

  if (!token || (items.length === 0 && !error)) return null;

  return (
    <section className="recent-searches" aria-labelledby="recent-searches-title">
      <div className="recent-searches-header">
        <h2 id="recent-searches-title" className="section-heading">{t('search.recent')}</h2>
        {items.length > 0 && (
          <button type="button" className="recent-searches-clear" onClick={() => setConfirmOpen(true)}>
            {t('search.clearRecent')}
          </button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul className="recent-searches-list">
        {items.map((item) => (
          <li key={item.id} className="recent-searches-item">
            <button type="button" className="recent-searches-query" onClick={() => onPick(item.query)}>
              <Clock size={16} aria-hidden="true" />
              <bdi>{item.query}</bdi>
            </button>
            <IconButton icon={X} iconSize={16} aria-label={t('search.removeRecent', { query: item.query })} onClick={() => remove(item)} />
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={clearAll}
        title={t('search.clearRecentTitle')}
        description={t('search.clearRecentDescription')}
        confirmLabel={t('search.clearRecent')}
        danger
      />
    </section>
  );
}

export default RecentSearches;
