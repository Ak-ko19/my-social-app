import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FeedErrorState from '../feed/FeedErrorState';
import { fetchAdminLog } from '../../services/adminService';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { formatDate } from '../../i18n';
import './AdminLogPanel.css';

// Kinds of decision, as the API names them (labels: admin.log.filter.<kind>).
// Days 103-104: 'admin_search' -- what an admin searched for. Day 106: page
// verification decisions.
const ACTIONS = ['report_dismissed', 'content_removed', 'user_banned', 'user_suspended', 'user_unbanned', 'error_resolved', 'admin_search',
  'page_verified', 'page_declined', 'page_unverified'];
// A name inside a sentence in the other script keeps its own direction
// (Unicode first-strong isolate ... pop directional isolate).
const isolate = (text) => `⁨${text}⁩`;

// One decision as a sentence: "alice removed a post by bob".
function sentence(t, entry) {
  const admin = isolate(entry.admin_username);
  const name = isolate(entry.target_label || t('admin.log.unknownName'));
  const what = t(`admin.log.what.${entry.target_type}`, { name });
  if (entry.action === 'user_suspended') return t('admin.log.sentence.user_suspended', { admin, name, count: entry.details.days, days: entry.details.days });
  if (entry.action === 'admin_search') return t('admin.log.sentence.admin_search', { admin, name, kind: t(`admin.log.searchKinds.${entry.details.type}`) });
  // Day 106: a decline or a removal says why.
  if (entry.details?.reason && entry.action.startsWith('page_')) {
    return t(`admin.log.sentence.${entry.action}`, { admin, name, reason: t(`admin.verification.reasons.${entry.details.reason}`) });
  }
  return t(`admin.log.sentence.${entry.action}`, { admin, name, what });
}

// Day 63: Admin > Log -- every moderation decision, newest first: who made
// it, what, about whom, when, why (a ban's reason) and how many reports it
// closed. The removed content itself is never shown or kept.
function AdminLogPanel({ token }) {
  const { t } = useTranslation();
  const [action, setAction] = useState('');
  const [data, setData] = useState(null); // { actions, hasMore, page }
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminLog(token, { action, page: 1 })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, action]);

  const retry = () => {
    setFailed(false);
    fetchAdminLog(token, { action, page: 1 }).then(setData).catch(() => setFailed(true));
  };
  const loadMore = () => {
    setLoadingMore(true);
    fetchAdminLog(token, { action, page: data.page + 1 })
      .then((d) => setData((current) => ({ ...d, actions: [...current.actions, ...d.actions] })))
      .catch(() => setFailed(true))
      .finally(() => setLoadingMore(false));
  };
  const choose = (value) => {
    setData(null);
    setFailed(false);
    setAction(value);
  };

  return (
    <div className="admin-log">
      <label className="admin-log-filter">
        <span>{t('admin.log.filterLabel')}</span>
        <select className="form-input" value={action} onChange={(e) => choose(e.target.value)}>
          <option value="">{t('admin.log.filter.all')}</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{t(`admin.log.filter.${a}`)}</option>)}
        </select>
      </label>

      {failed && <FeedErrorState message={t('admin.log.loadFailed')} onRetry={retry} />}
      {!data && !failed && <p className="screen-status" role="status">{t('common.loading')}</p>}
      {data && data.actions.length === 0 && (
        <div className="admin-empty">
          <ScrollText size={28} aria-hidden="true" />
          <p>{action ? t('admin.log.emptyFiltered') : t('admin.log.empty')}</p>
        </div>
      )}
      {data && data.actions.length > 0 && (
        <ul className="admin-log-list">
          {data.actions.map((entry) => (
            <li key={entry.id} className="admin-log-entry">
              <p className="admin-log-sentence">{sentence(t, entry)}</p>
              <p className="admin-log-meta">
                <time dateTime={entry.created_at} title={formatDate(entry.created_at, 'longTime')}>{formatRelativeTime(entry.created_at)}</time>
                {entry.details.reportsResolved > 0 && <>{' · '}{t('admin.log.reportsClosed', { count: entry.details.reportsResolved, n: entry.details.reportsResolved })}</>}
              </p>
              {entry.details.reason && (
                <p className="admin-log-reason">
                  {t('admin.log.reason')} <bdi>{entry.details.reason}</bdi>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.hasMore && (
        <button type="button" className="btn btn-secondary btn-block" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? t('common.loading') : t('admin.log.loadMore')}
        </button>
      )}
      <p className="admin-log-note">{t('admin.log.note')}</p>
    </div>
  );
}

export default AdminLogPanel;
