import { useCallback, useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import FeedErrorState from '../feed/FeedErrorState';
import { fetchErrors, resolveError } from '../../services/adminService';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import './AdminErrorsPanel.css';

// Day 10: the built-in error log in the admin panel. One card per distinct
// error (the backend groups repeats), most recently seen first. "Mark
// resolved" files it away; it comes back by itself if it happens again.
function ErrorCard({ error, token, onResolved }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const resolve = () => {
    setBusy(true);
    setFailed(false);
    resolveError(error.fingerprint, token)
      .then(() => onResolved(error.fingerprint))
      .catch((err) => {
        console.error(err);
        setFailed(true);
        setBusy(false);
      });
  };

  return (
    <li className="admin-error">
      <div className="admin-error-top">
        <span className={clsx('admin-error-source', `is-${error.source}`)}>{t(`admin.errors.source.${error.source}`)}</span>
        {error.route && <code className="admin-error-route" dir="ltr">{error.route}</code>}
        {/* dir: "×2" would otherwise show as "2×" in right-to-left text. */}
        <span className="admin-error-count" dir="ltr" title={t('admin.errors.countTitle')}>×{error.count}</span>
      </div>
      {/* Error text is English/code: keep it left-to-right in every language. */}
      <p className="admin-error-message" dir="ltr">{error.message}</p>
      <p className="admin-error-meta">
        {t('admin.errors.lastSeen', { time: formatRelativeTime(error.last_seen) })}
        {' · '}
        {t('admin.errors.firstSeen', { time: formatRelativeTime(error.first_seen) })}
        {error.last_username && <>{' · '}{t('admin.errors.lastUser', { name: error.last_username })}</>}
      </p>
      {error.stack && (
        <details className="admin-error-details">
          <summary>{t('admin.errors.details')}</summary>
          <pre dir="ltr">{error.stack}</pre>
        </details>
      )}
      {!error.resolved_at && (
        <div className="admin-error-actions">
          <button type="button" className="btn btn-secondary" onClick={resolve} disabled={busy}>
            {busy ? t('admin.errors.resolving') : t('admin.errors.resolve')}
          </button>
        </div>
      )}
      {failed && <p className="form-error" role="alert">{t('admin.actionFailed')}</p>}
    </li>
  );
}

function AdminErrorsPanel({ token }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null); // { errors, hasMore, page }
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback((page = 1) => {
    return fetchErrors(token, { status, page }).then((d) => {
      setData((current) => (page === 1 || !current ? d : { ...d, errors: [...current.errors, ...d.errors] }));
    });
  }, [token, status]);

  useEffect(() => {
    let cancelled = false;
    fetchErrors(token, { status, page: 1 })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(t('admin.errors.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [token, status, t]);

  const retry = () => {
    setError('');
    load(1).catch((err) => {
      console.error(err);
      setError(t('admin.errors.loadFailed'));
    });
  };

  const loadMore = () => {
    setLoadingMore(true);
    load(data.page + 1)
      .catch((err) => {
        console.error(err);
        setError(t('admin.errors.loadFailed'));
      })
      .finally(() => setLoadingMore(false));
  };

  const removeFromList = (fingerprint) =>
    setData((current) => ({ ...current, errors: current.errors.filter((e) => e.fingerprint !== fingerprint) }));

  return (
    <>
      <div role="tablist" aria-label={t('admin.errors.statusTabs')} className="admin-tabs">
        {['open', 'resolved'].map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            className={clsx('admin-tab', status === s && 'is-active')}
            onClick={() => {
              setData(null);
              setError('');
              setStatus(s);
            }}
          >
            {t(`admin.errors.${s}`)}
          </button>
        ))}
      </div>

      {error && <FeedErrorState message={error} onRetry={retry} />}
      {!data && !error && <p className="screen-status" role="status">{t('admin.errors.loading')}</p>}
      {data && data.errors.length === 0 && (
        <div className="admin-empty">
          <Bug size={28} aria-hidden="true" />
          <p>{status === 'open' ? t('admin.errors.emptyOpen') : t('admin.errors.emptyResolved')}</p>
        </div>
      )}
      {data && data.errors.length > 0 && (
        <ul className="admin-error-list">
          {data.errors.map((e) => (
            <ErrorCard key={e.fingerprint} error={e} token={token} onResolved={removeFromList} />
          ))}
        </ul>
      )}
      {data && data.hasMore && (
        <div className="admin-error-actions admin-errors-more">
          <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('admin.errors.loading') : t('admin.errors.loadMore')}
          </button>
        </div>
      )}
    </>
  );
}

export default AdminErrorsPanel;
