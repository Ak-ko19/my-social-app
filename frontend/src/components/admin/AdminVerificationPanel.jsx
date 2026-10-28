import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog, NameWithTick } from '../ui';
import FeedErrorState from '../feed/FeedErrorState';
import { approvePageVerification, declinePageVerification, fetchPageVerifications, unverifyPage } from '../../services/adminService';
import { categoryLabel } from '../../services/pageService';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { serverErrorText } from '../../utils/serverError';
import './AdminVerificationPanel.css';

const STATUSES = ['pending', 'reviewed'];
// Labels: admin.verification.reasons.<key> (the page's managers read
// pages.verification.reasons.<key>).
const REASONS = ['incomplete', 'not_notable', 'impersonation', 'other'];

// Day 106: Admin > Verification -- pages asking for the blue tick, oldest
// first, with what the admin needs to judge them (the page, who runs it,
// their note and link, earlier declines). Approve, or decline with a
// reason; under Reviewed, a page that still has its tick can lose it.
// Every decision is in the admin log (backend pageVerificationService).
function AdminVerificationPanel({ token }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null); // { requests, hasMore, page }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const requestRef = useRef(0);

  // Every state change happens in the request's callbacks; the handlers
  // below reset what they need first (busy, the error) themselves.
  const load = useCallback((page = 1) => {
    const id = ++requestRef.current;
    fetchPageVerifications(token, { status, page })
      .then((d) => {
        if (id !== requestRef.current) return;
        setData((current) => (page === 1 || !current ? d : { ...d, requests: [...current.requests, ...d.requests] }));
        setError('');
      })
      .catch((err) => {
        if (id !== requestRef.current) return;
        console.error(err);
        setError(t('admin.verification.loadFailed'));
      })
      .finally(() => {
        if (id === requestRef.current) setLoading(false);
      });
  }, [token, status, t]);
  useEffect(() => {
    load(1);
  }, [load]);

  const choose = (s) => {
    if (s === status) return;
    setData(null);
    setError('');
    setNotice('');
    setStatus(s);
  };
  const retry = () => {
    setError('');
    load(1);
  };
  const loadMore = () => {
    setLoading(true);
    load(data.page + 1);
  };
  // After a decision: say what happened, and show the list as it is now.
  const done = (message) => {
    setNotice(message);
    load(1);
  };

  return (
    <div className="admin-verification">
      <div role="tablist" aria-label={t('admin.verification.statusTabs')} className="admin-tabs">
        {STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={status === s} className={clsx('admin-tab', status === s && 'is-active')} onClick={() => choose(s)}>
            {t(`admin.verification.tabs.${s}`)}
          </button>
        ))}
      </div>
      <p className="admin-verification-notice" role="status">{notice}</p>

      {error && <FeedErrorState message={error} onRetry={retry} />}
      {!data && !error && <p className="screen-status" role="status">{t('common.loading')}</p>}
      {data && data.requests.length === 0 && (
        <div className="admin-empty">
          <BadgeCheck size={28} aria-hidden="true" />
          <p>{t(status === 'pending' ? 'admin.verification.emptyPending' : 'admin.verification.emptyReviewed')}</p>
        </div>
      )}
      {data && data.requests.length > 0 && (
        <ul className="admin-verification-list">
          {data.requests.map((r) => (
            <RequestCard key={r.id} request={r} token={token} onDone={done} />
          ))}
        </ul>
      )}
      {data && data.hasMore && (
        <button type="button" className="btn btn-secondary btn-block" disabled={loading} onClick={loadMore}>
          {loading ? t('common.loading') : t('common.loadMore')}
        </button>
      )}
    </div>
  );
}

function ReasonSelect({ id, value, onChange, label }) {
  const { t } = useTranslation();
  return (
    <>
      <label className="feed-visually-hidden" htmlFor={id}>{label}</label>
      <select id={id} className="form-input admin-verification-reason" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('admin.verification.chooseReason')}</option>
        {REASONS.map((k) => <option key={k} value={k}>{t(`admin.verification.reasons.${k}`)}</option>)}
      </select>
    </>
  );
}

function RequestCard({ request: r, token, onDone }) {
  const { t } = useTranslation();
  const page = r.page;
  const [reason, setReason] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (fn, message) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      onDone(message);
    } catch (err) {
      setError(serverErrorText(err, 'admin.actionFailed'));
      setBusy(false);
    }
  };
  const approve = () => act(() => approvePageVerification(r.id, token), t('admin.verification.approved', { name: page.name }));
  const decline = () => {
    if (!reason) {
      setError(t('admin.verification.reasonNeeded'));
      return;
    }
    act(() => declinePageVerification(r.id, reason, token), t('admin.verification.declinedDone', { name: page.name }));
  };
  const remove = () => {
    setConfirmRemove(false);
    act(() => unverifyPage(page.id, removeReason, token), t('admin.verification.removed', { name: page.name }));
  };

  const asker = r.requested_by_username || t('admin.deletedAccount');
  return (
    <li className="admin-verification-item">
      <p className="admin-verification-name">
        <Link to={`/pages/${page.id}`}>
          <NameWithTick name={page.name} verified={Boolean(page.verified_at)} tickSize={15} />
        </Link>
      </p>
      <p className="admin-verification-meta">
        <span>{categoryLabel(page.category)}</span>
        <span>{t('pages.followerCount', { count: page.follower_count })}</span>
        <span>{t('admin.verification.postCount', { count: page.post_count })}</span>
        <span>{t('admin.verification.pageAge', { when: formatRelativeTime(page.created_at) })}</span>
      </p>
      <p className="admin-verification-meta">
        <span>{t('admin.verification.owner')} <Link to={`/profile/${page.owner_id}`}>{page.owner_username}</Link></span>
        <span>{t('admin.verification.askedBy', { name: asker, when: formatRelativeTime(r.created_at) })}</span>
        {r.other_declines > 0 && <span className="admin-verification-flag">{t('admin.verification.otherDeclines', { count: r.other_declines })}</span>}
      </p>
      {page.description && <p className="admin-verification-about" dir="auto">{page.description}</p>}
      <blockquote className="admin-verification-note" dir="auto">{r.note}</blockquote>
      {r.link && (
        <p className="admin-verification-link">
          {t('admin.verification.link')}{' '}
          <a href={r.link} target="_blank" rel="noopener noreferrer nofollow ugc" dir="ltr">{r.link}</a>
        </p>
      )}

      {r.status === 'pending' ? (
        <div className="admin-verification-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={approve} disabled={busy}>{t('admin.verification.approve')}</button>
          <div className="admin-verification-decline">
            <ReasonSelect id={`decline-reason-${r.id}`} value={reason} onChange={setReason} label={t('admin.verification.declineReasonLabel', { name: page.name })} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={decline} disabled={busy}>{t('admin.verification.decline')}</button>
          </div>
        </div>
      ) : (
        <>
          <p className="admin-verification-meta">
            {r.status === 'approved'
              ? <span>{t('admin.verification.approvedBy', { name: r.decided_by_username || t('admin.deletedAccount'), when: formatRelativeTime(r.decided_at) })}</span>
              : <span>{t('admin.verification.declinedBy', { name: r.decided_by_username || t('admin.deletedAccount'), when: formatRelativeTime(r.decided_at), reason: t(`admin.verification.reasons.${r.decline_reason}`) })}</span>}
          </p>
          {r.status === 'approved' && page.verified_at && (
            <div className="admin-verification-actions">
              <div className="admin-verification-decline">
                <ReasonSelect id={`remove-reason-${r.id}`} value={removeReason} onChange={setRemoveReason} label={t('admin.verification.removeReasonLabel', { name: page.name })} />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm admin-danger"
                  disabled={busy}
                  onClick={() => (removeReason ? setConfirmRemove(true) : setError(t('admin.verification.reasonNeeded')))}
                >
                  {t('admin.verification.remove')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={remove}
        title={t('admin.verification.removeTitle', { name: page.name })}
        description={t('admin.verification.removeText')}
        confirmLabel={t('admin.verification.remove')}
        danger
      />
    </li>
  );
}

export default AdminVerificationPanel;
