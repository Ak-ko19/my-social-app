import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VerifiedTick } from '../ui';
import FeedErrorState from '../feed/FeedErrorState';
import { fetchPageVerification, requestPageVerification, withdrawPageVerification } from '../../services/pageService';
import { serverErrorText } from '../../utils/serverError';
import { formatDate } from '../../i18n';
import './PageVerificationSection.css';

const NOTE_MAX = 500;
const LINK_MAX = 300;

// Day 106: Edit page > Verification. The page's owner and admins see where
// its blue tick stands -- verified, a request waiting, declined (and why),
// removed -- and ask for it when they can (backend
// services/pageVerificationService.js). Reloads when the page's name or
// About text changes above (a new name loses the tick; the About text is
// needed to ask).
function PageVerificationSection({ page, token }) {
  const { t } = useTranslation();
  const [state, setState] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    fetchPageVerification(page.id, token)
      .then((s) => {
        setState(s);
        setLoadFailed(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadFailed(true);
      });
  }, [page.id, token]);
  useEffect(load, [load, page.is_verified, page.description]);

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!note.trim()) {
      setError(t('pages.verification.noteNeeded'));
      return;
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      setState(await requestPageVerification(page.id, { note, link: link.trim() || null }, token));
      setNote('');
      setLink('');
      setStatus(t('pages.verification.sent'));
    } catch (err) {
      setError(serverErrorText(err, 'pages.verification.failed'));
      load();
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      setState(await withdrawPageVerification(page.id, token));
      setStatus(t('pages.verification.withdrawn'));
    } catch (err) {
      setError(serverErrorText(err, 'pages.verification.failed'));
    } finally {
      setBusy(false);
    }
  };

  const heading = <h2 id="page-verification-heading" className="section-heading">{t('pages.verification.title')}</h2>;
  if (loadFailed) {
    return (
      <section aria-labelledby="page-verification-heading" className="page-verification">
        {heading}
        <FeedErrorState message={t('pages.verification.loadFailed')} onRetry={load} />
      </section>
    );
  }
  if (!state) {
    return (
      <section aria-labelledby="page-verification-heading" className="page-verification">
        {heading}
        <p className="screen-status" role="status">{t('common.loading')}</p>
      </section>
    );
  }

  const { request } = state;
  const reason = request?.decline_reason ? t(`pages.verification.reasons.${request.decline_reason}`) : '';
  const nextDate = state.next_request_at ? formatDate(state.next_request_at, 'long') : '';
  return (
    <section aria-labelledby="page-verification-heading" className="page-verification">
      {heading}
      {state.why_not === 'verified' && (
        <div className="page-verification-card is-verified">
          <VerifiedTick size={22} />
          <div>
            <p className="page-verification-title">{t('pages.verification.verified')}</p>
            <p className="page-verification-text">{t('pages.verification.verifiedSince', { date: formatDate(state.verified_at, 'long') })}</p>
            <p className="page-verification-text">{t('pages.verification.renameWarning')}</p>
          </div>
        </div>
      )}
      {state.why_not === 'pending' && (
        <div className="page-verification-card">
          <div>
            <p className="page-verification-title">{t('pages.verification.pending')}</p>
            <p className="page-verification-text">{t('pages.verification.pendingSince', { date: formatDate(request.created_at, 'long') })}</p>
            <blockquote className="page-verification-note" dir="auto">{request.note}</blockquote>
            <button type="button" className="btn btn-secondary btn-sm" onClick={withdraw} disabled={busy}>{t('pages.verification.withdraw')}</button>
          </div>
        </div>
      )}
      {state.why_not !== 'verified' && state.why_not !== 'pending' && (
        <>
          {request?.status === 'declined' && (
            <div className="page-verification-card is-declined">
              <div>
                <p className="page-verification-title">{t('pages.verification.declined')}</p>
                <p className="page-verification-text">{reason}</p>
              </div>
            </div>
          )}
          {state.removed && (
            <div className="page-verification-card is-declined">
              <div>
                <p className="page-verification-title">{t(state.removed === 'admin' ? 'pages.verification.removedByAdmin' : 'pages.verification.removedRenamed')}</p>
              </div>
            </div>
          )}
          {state.why_not === 'wait' && <p className="page-verification-text">{t('pages.verification.waitUntil', { date: nextDate })}</p>}
          {state.why_not === 'no_about' && <p className="page-verification-text">{t('pages.verification.needsAbout')}</p>}
          {state.can_request && (
            <form className="form-stack page-verification-form" onSubmit={send} noValidate>
              <p className="page-verification-text">{t('pages.verification.intro')}</p>
              {/* The counter is outside the label, so it isn't read as part of the field's name. */}
              <div className="form-field">
                <label className="form-label" htmlFor="page-verification-note">{t('pages.verification.noteLabel')}</label>
                <textarea
                  id="page-verification-note"
                  className="form-input"
                  rows="3"
                  maxLength={NOTE_MAX}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('pages.verification.notePlaceholder')}
                  aria-describedby="page-verification-count"
                />
                <span id="page-verification-count" className="page-verification-count">{t('pages.verification.count', { used: [...note].length, max: NOTE_MAX })}</span>
              </div>
              <label className="form-field">
                <span className="form-label">{t('pages.verification.linkLabel')}</span>
                <input
                  className="form-input"
                  type="text"
                  inputMode="url"
                  dir="ltr"
                  maxLength={LINK_MAX}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder={t('pages.verification.linkPlaceholder')}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{t('pages.verification.ask')}</button>
            </form>
          )}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="page-verification-status" role="status">{status}</p>
    </section>
  );
}

export default PageVerificationSection;
