import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import { fetchReports, dismissReport, removeReportedContent, banUser, unbanUser } from '../services/adminService';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { Trans, useTranslation } from 'react-i18next';
import { serverErrorText } from '../utils/serverError';
import '../components/feed/Feed.css';
import './AdminScreen.css';

// Labels: admin.resolution.<key>.
const RESOLUTIONS = ['dismissed', 'content_removed', 'user_banned'];

// One report, with the actions an admin can take on it. Ban asks for an
// optional reason inline before confirming.
function ReportCard({ report, token, onDone }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isPost = report.target_type === 'post';
  const targetUserId = isPost ? report.post_author_id : report.target_id;
  const targetUsername = isPost ? report.post_author_username : report.target_username;
  const pending = report.status === 'pending';

  const act = (fn) => {
    setBusy(true);
    setError('');
    fn()
      .then(() => onDone())
      .catch((err) => {
        console.error(err);
        setError(serverErrorText(err, 'admin.actionFailed'));
        setBusy(false);
      });
  };

  return (
    <li className={clsx('admin-report', !pending && 'is-reviewed')}>
      <div className="admin-report-head">
        <span className="admin-report-reason">{t(`report.reasons.${report.reason}`, { defaultValue: report.reason })}</span>
        {pending && report.pending_for_target > 1 && (
          <span className="admin-report-count">{t('admin.reportCount', { count: report.pending_for_target })}</span>
        )}
        <span className="admin-report-time">{formatRelativeTime(report.created_at)}</span>
      </div>

      <div className="admin-report-target">
        {isPost ? (
          report.target_exists ? (
            <>
              <span className="admin-report-kind"><Trans i18nKey="admin.postBy" values={{ name: report.post_author_username }} components={{ link: <Link to={`/profile/${report.post_author_id}`} /> }} /></span>
              <p className="admin-report-quote">“{report.post_content}”</p>
              <Link to={`/posts/${report.target_id}`} className="admin-report-link">{t('admin.openPost')}</Link>
            </>
          ) : (
            <span className="admin-report-kind">{t('admin.postRemoved')}</span>
          )
        ) : report.target_exists ? (
          <span className="admin-report-kind">
            <Trans i18nKey="admin.account" values={{ name: report.target_username }} components={{ link: <Link to={`/profile/${report.target_id}`} /> }} />
            {report.target_banned && <span className="admin-banned-tag">{t('admin.banned')}</span>}
          </span>
        ) : (
          <span className="admin-report-kind">{t('admin.accountDeleted')}</span>
        )}
      </div>

      {report.details && <p className="admin-report-details">{report.details}</p>}
      <p className="admin-report-meta">{t('admin.reportedBy', { name: report.reporter_username })}</p>

      {!pending && (
        <p className="admin-report-resolution">
          {(() => {
            const label = t(`admin.resolution.${RESOLUTIONS.includes(report.resolution) ? report.resolution : 'reviewed'}`);
            return report.resolved_by_username ? t('admin.resolvedBy', { label, name: report.resolved_by_username }) : label;
          })()}
          {report.resolved_at && ` · ${formatRelativeTime(report.resolved_at)}`}
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {pending && !banOpen && (
        <div className="admin-report-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => dismissReport(report.id, token))}>
            {t('admin.dismiss')}
          </button>
          {isPost && report.target_exists && (
            <button type="button" className="btn btn-secondary btn-sm admin-danger" disabled={busy} onClick={() => act(() => removeReportedContent(report.id, token))}>
              {t('admin.removePost')}
            </button>
          )}
          {targetUserId && (
            <button type="button" className="btn btn-sm admin-danger-solid" disabled={busy} onClick={() => setBanOpen(true)}>
              {t('admin.ban', { name: targetUsername })}
            </button>
          )}
        </div>
      )}

      {pending && banOpen && (
        <form
          className="admin-ban-form"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => banUser(targetUserId, reason, token));
          }}
        >
          <label className="form-field">
            <span className="form-label">{t('admin.banReason', { name: targetUsername })}</span>
            <input className="form-input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
          <div className="admin-report-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBanOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-sm admin-danger-solid" disabled={busy}>
              {busy ? t('admin.banning') : t('admin.confirmBan')}
            </button>
          </div>
        </form>
      )}

      {!pending && report.resolution === 'user_banned' && targetUserId && report.target_banned !== false && (
        <div className="admin-report-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => unbanUser(targetUserId, token))}>
            {t('admin.unban', { name: targetUsername })}
          </button>
        </div>
      )}
    </li>
  );
}

// B12 admin panel: /admin. Pending reports oldest-first (nothing waits
// forever), reviewed ones newest-first with their outcome. The API returns
// 404 to non-admins; this screen then shows "Not found" too.
function AdminScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notAdmin, setNotAdmin] = useState(false);

  const load = useCallback(() => {
    setError('');
    fetchReports(token, { status })
      .then(setData)
      .catch((err) => {
        if (err.response?.status === 404) {
          setNotAdmin(true);
          return;
        }
        console.error(err);
        setError(t('admin.loadFailed'));
      });
  }, [token, status, t]);

  useEffect(() => {
    let cancelled = false;
    fetchReports(token, { status })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 404) setNotAdmin(true);
        else {
          console.error(err);
          setError(t('admin.loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, status, t]);

  if (notAdmin) {
    return (
      <div className="screen-enter">
        <header className="screen-header">
          <IconButton icon={ChevronLeft} aria-label={t('common.back')} onClick={() => navigate(-1)} />
          <h1 className="screen-header-title">{t('admin.notFoundTitle')}</h1>
        </header>
        <p className="screen-status">{t('admin.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('common.backToSettings')} onClick={() => navigate('/settings')} />
        <h1 className="screen-header-title">{t('admin.title')}</h1>
      </header>
      <div className="screen-body">
        <div role="tablist" aria-label={t('admin.statusTabs')} className="admin-tabs">
          {['pending', 'reviewed'].map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              className={clsx('admin-tab', status === s && 'is-active')}
              onClick={() => {
                setData(null);
                setStatus(s);
              }}
            >
              {s === 'pending' ? t('admin.pending') : t('admin.reviewedTab')}
            </button>
          ))}
        </div>

        {error && <FeedErrorState message={error} onRetry={load} />}
        {!data && !error && <p className="screen-status" role="status">{t('admin.loading')}</p>}
        {data && data.reports.length === 0 && (
          <div className="admin-empty">
            <ShieldAlert size={28} aria-hidden="true" />
            <p>{status === 'pending' ? t('admin.emptyPending') : t('admin.emptyReviewed')}</p>
          </div>
        )}
        {data && data.reports.length > 0 && (
          <ul className="admin-report-list">
            {data.reports.map((r) => (
              <ReportCard key={r.id} report={r} token={token} onDone={load} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AdminScreen;
