import { getOptimizedImageUrl } from '../utils/cloudinaryImage';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { ConfirmDialog, IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import AdminErrorsPanel from '../components/admin/AdminErrorsPanel';
import AdminStoragePanel from '../components/admin/AdminStoragePanel';
import AdminOverviewPanel from '../components/admin/AdminOverviewPanel';
import { fetchReports, dismissReport, removeReportedContent, banUser, suspendUser, unbanUser } from '../services/adminService';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { Trans, useTranslation } from 'react-i18next';
import { serverErrorText } from '../utils/serverError';
import { formatDate } from '../i18n';
import '../components/feed/Feed.css';
import './AdminScreen.css';

// The sections, in tab order (labels: admin.section.<key>).
const SECTIONS = ['overview', 'reports', 'errors', 'storage'];
// Labels: admin.resolution.<key>.
const RESOLUTIONS = ['dismissed', 'content_removed', 'user_banned', 'user_suspended'];
// Day 12: suspension lengths an admin can pick (the API accepts these).
const SUSPEND_DAYS = [1, 3, 7, 30];
const REMOVE_LABEL = { post: 'admin.removePost', comment: 'admin.removeComment', message: 'admin.removeMessage', community: 'admin.removeGroup', page: 'admin.removePage' };
// Day 24: removing a whole group or page (with all its posts) asks first.
const CONFIRM_REMOVE = { community: 'admin.confirmRemoveGroup', page: 'admin.confirmRemovePage' };

// "Banned", or "Suspended until <date>" for a suspension.
function RestrictionTag({ until }) {
  const { t } = useTranslation();
  return (
    <span className="admin-banned-tag">
      {until ? t('admin.suspendedUntil', { date: formatDate(until, 'longTime') }) : t('admin.banned')}
    </span>
  );
}

// Day 12: a reported comment or message -- only that one item, never the
// rest of the conversation. If it has since been deleted/unsent, the text
// as it was when reported (target_snapshot) is shown instead.
function ReportedText({ report }) {
  const { t } = useTranslation();
  const isComment = report.target_type === 'comment';
  const name = report.target_owner_username;
  const owner = name
    ? { values: { name }, components: { link: <Link to={`/profile/${report.target_owner_id}`} /> } }
    : { values: { name: t('admin.deletedAccount') }, components: { link: <span /> } };
  const text = isComment ? report.comment_content : report.message_content;
  let kind = isComment ? 'admin.commentBy' : 'admin.messageBy';
  if (!isComment && report.message_type === 'voice') kind = 'admin.voiceBy';
  if (!isComment && report.message_type === 'image') kind = 'admin.photoBy';

  if (!report.target_exists) {
    return (
      <>
        <span className="admin-report-kind">
          {t(isComment ? 'admin.commentDeleted' : 'admin.messageDeleted')}
          {name && <> · <Trans i18nKey={isComment ? 'admin.commentBy' : 'admin.messageBy'} {...owner} /></>}
        </span>
        {report.target_snapshot && (
          <p className="admin-report-quote" dir="auto">
            {/* bdi: the reported text keeps its own direction (and its
                quote marks) next to a label in the other script. */}
            <span className="admin-report-asreported">{t('admin.asReported')}</span> <bdi>“{report.target_snapshot}”</bdi>
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <span className="admin-report-kind"><Trans i18nKey={kind} {...owner} /></span>
      {report.message_type === 'voice' && report.message_media_url && (
        <audio className="admin-report-audio" controls preload="none" src={report.message_media_url} />
      )}
      {report.message_type === 'image' && report.message_media_url && (
        <a href={report.message_media_url} target="_blank" rel="noreferrer">
          <img className="admin-report-image" src={getOptimizedImageUrl(report.message_media_url, 640)} decoding="async" alt={t('admin.reportedPhoto')} loading="lazy" />
        </a>
      )}
      {text && <p className="admin-report-quote" dir="auto">“{text}”</p>}
      {isComment && report.comment_post_id && (
        <Link to={`/posts/${report.comment_post_id}`} className="admin-report-link">{t('admin.openPost')}</Link>
      )}
    </>
  );
}

// Day 24: a reported group or page -- name, link and who made it; once
// removed, its name and description as reported.
function ReportedPlace({ report }) {
  const { t } = useTranslation();
  const isGroup = report.target_type === 'community';
  const name = isGroup ? report.community_name : report.page_name;
  const to = isGroup ? `/groups/${report.target_id}` : `/pages/${report.target_id}`;
  if (!report.target_exists) {
    return (
      <>
        <span className="admin-report-kind">{t(isGroup ? 'admin.groupRemoved' : 'admin.pageRemoved')}</span>
        {report.target_snapshot && (
          <p className="admin-report-quote" dir="auto">
            <span className="admin-report-asreported">{t('admin.asReported')}</span> <bdi>“{report.target_snapshot}”</bdi>
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <span className="admin-report-kind">
        <Trans i18nKey={isGroup ? 'admin.groupNamed' : 'admin.pageNamed'} values={{ name }} components={{ link: <Link to={to} /> }} />
        {isGroup && report.community_privacy === 'private' && <span className="admin-banned-tag">{t('admin.privateGroup')}</span>}
      </span>
      {report.target_owner_username && (
        <span className="admin-report-meta">{t('admin.madeBy', { name: report.target_owner_username })}</span>
      )}
      {report.target_snapshot && <p className="admin-report-quote" dir="auto">“{report.target_snapshot}”</p>}
    </>
  );
}

// One report, with the actions an admin can take on it. Ban and suspend
// (Day 12) ask for an optional reason inline -- and suspend for how long --
// before confirming.
function ReportCard({ report, token, onDone }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restrict, setRestrict] = useState(null); // null | 'ban' | 'suspend'
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const banOpen = restrict !== null;

  const isPost = report.target_type === 'post';
  const isUser = report.target_type === 'user';
  // Whose content it is (the account a ban would hit). Day 12 reports
  // carry target_owner_*; a post reported before that falls back to the
  // post's live author.
  const targetUserId = isUser ? report.target_id : report.target_owner_id ?? report.post_author_id;
  const targetUsername = isUser ? report.target_username : report.target_owner_username ?? report.post_author_username;
  const targetBanned = isUser ? report.target_banned : report.target_owner_banned;
  const targetBannedUntil = isUser ? report.target_banned_until : report.target_owner_banned_until;
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
        {report.target_type === 'comment' || report.target_type === 'message' ? (
          <ReportedText report={report} />
        ) : report.target_type === 'community' || report.target_type === 'page' ? (
          <ReportedPlace report={report} />
        ) : isPost ? (
          report.target_exists ? (
            <>
              <span className="admin-report-kind"><Trans i18nKey="admin.postBy" values={{ name: report.post_author_username }} components={{ link: <Link to={`/profile/${report.post_author_id}`} /> }} /></span>
              <p className="admin-report-quote" dir="auto">“{report.post_content}”</p>
              <Link to={`/posts/${report.target_id}`} className="admin-report-link">{t('admin.openPost')}</Link>
            </>
          ) : (
            <span className="admin-report-kind">{t('admin.postRemoved')}</span>
          )
        ) : report.target_exists ? (
          <span className="admin-report-kind">
            <Trans i18nKey="admin.account" values={{ name: report.target_username }} components={{ link: <Link to={`/profile/${report.target_id}`} /> }} />
            {report.target_banned && <RestrictionTag until={report.target_banned_until} />}
          </span>
        ) : (
          <span className="admin-report-kind">{t('admin.accountDeleted')}</span>
        )}
      </div>

      {report.details && <p className="admin-report-details" dir="auto">{report.details}</p>}
      <p className="admin-report-meta">{t('admin.reportedBy', { name: report.reporter_username })}</p>

      {!pending && (
        <p className="admin-report-resolution">
          {(() => {
            let label = t(`admin.resolution.${RESOLUTIONS.includes(report.resolution) ? report.resolution : 'reviewed'}`);
            if (report.resolution === 'content_removed' && report.target_type === 'comment') label = t('admin.removedComment');
            if (report.resolution === 'content_removed' && report.target_type === 'message') label = t('admin.removedMessage');
            if (report.resolution === 'content_removed' && report.target_type === 'community') label = t('admin.removedGroup');
            if (report.resolution === 'content_removed' && report.target_type === 'page') label = t('admin.removedPage');
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
          {!isUser && report.target_exists && (
            <button type="button" className="btn btn-secondary btn-sm admin-danger" disabled={busy} onClick={() => (CONFIRM_REMOVE[report.target_type] ? setConfirmRemove(true) : act(() => removeReportedContent(report.id, token)))}>
              {t(REMOVE_LABEL[report.target_type])}
            </button>
          )}
          {targetUserId && (
            <button type="button" className="btn btn-secondary btn-sm admin-danger" disabled={busy} onClick={() => setRestrict('suspend')}>
              {t('admin.suspend', { name: targetUsername })}
            </button>
          )}
          {targetUserId && (
            <button type="button" className="btn btn-sm admin-danger-solid" disabled={busy} onClick={() => setRestrict('ban')}>
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
            act(() => (restrict === 'ban' ? banUser(targetUserId, reason, token) : suspendUser(targetUserId, days, reason, token)));
          }}
        >
          {restrict === 'suspend' && (
            <fieldset className="admin-suspend-days">
              <legend className="form-label">{t('admin.suspendFor', { name: targetUsername })}</legend>
              {SUSPEND_DAYS.map((d) => (
                <label key={d} className="admin-suspend-day">
                  <input type="radio" name={`suspend-days-${report.id}`} value={d} checked={days === d} onChange={() => setDays(d)} />
                  <span>{t('admin.days', { count: d })}</span>
                </label>
              ))}
            </fieldset>
          )}
          <label className="form-field">
            <span className="form-label">
              {restrict === 'ban' ? t('admin.banReason', { name: targetUsername }) : t('admin.suspendReason')}
            </span>
            <input className="form-input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
          <div className="admin-report-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRestrict(null)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-sm admin-danger-solid" disabled={busy}>
              {restrict === 'ban'
                ? busy ? t('admin.banning') : t('admin.confirmBan')
                : busy ? t('admin.suspending') : t('admin.confirmSuspend')}
            </button>
          </div>
        </form>
      )}

      {!pending && (report.resolution === 'user_banned' || report.resolution === 'user_suspended') && targetUserId && targetBanned !== false && (
        <div className="admin-report-actions">
          {!isUser && targetBanned && <RestrictionTag until={targetBannedUntil} />}
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => unbanUser(targetUserId, token))}>
            {targetBannedUntil ? t('admin.liftSuspension', { name: targetUsername }) : t('admin.unban', { name: targetUsername })}
          </button>
        </div>
      )}
      {CONFIRM_REMOVE[report.target_type] && (
        <ConfirmDialog
          open={confirmRemove}
          title={t(CONFIRM_REMOVE[report.target_type], { name: report.community_name || report.page_name || '' })}
          description={t('admin.confirmRemoveBody')}
          confirmLabel={t(REMOVE_LABEL[report.target_type])}
          danger
          onConfirm={() => {
            setConfirmRemove(false);
            act(() => removeReportedContent(report.id, token));
          }}
          onClose={() => setConfirmRemove(false)}
        />
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
  // Day 61: the open section lives in the URL (/admin?section=reports), so
  // it can be linked to and Back returns to the previous one. The Overview
  // opens first.
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.includes(params.get('section')) ? params.get('section') : 'overview';
  const setSection = (s) => setParams(s === 'overview' ? {} : { section: s });
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
        {/* Day 10: Reports | Errors. Day 57: | Storage. Day 61: Overview first. */}
        <div role="tablist" aria-label={t('admin.sections')} className="admin-tabs admin-sections">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              className={clsx('admin-tab', section === s && 'is-active')}
              onClick={() => setSection(s)}
            >
              {t(`admin.section.${s}`)}
            </button>
          ))}
        </div>

        {section === 'overview' && <AdminOverviewPanel token={token} onOpenSection={setSection} />}
        {section === 'storage' && <AdminStoragePanel token={token} />}
        {section === 'errors' && <AdminErrorsPanel token={token} />}
        {section === 'reports' && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export default AdminScreen;
