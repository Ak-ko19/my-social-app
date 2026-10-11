import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, ConfirmDialog } from '../ui';
import { resolveImageUrl } from '../../api';
import FeedErrorState from '../feed/FeedErrorState';
import { addPageAdmin, fetchPageAdmins, removePageAdmin } from '../../services/pageService';
import { serverErrorText } from '../../utils/serverError';
import './PageAdminsSection.css';

const MAX_ADMINS = 20;
const initials = (name) => (name || '?').slice(0, 2).toUpperCase();

// Day 53: Edit page > Admins. Everyone who runs the page sees who does;
// the owner adds people by username and removes them; an admin can leave
// (onLeft: they no longer manage the page).
function PageAdminsSection({ page, token, userId, onLeft }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null); // { owner, admins }
  const [loadFailed, setLoadFailed] = useState(false);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [removing, setRemoving] = useState(null); // the admin about to go (or you, leaving)

  const load = useCallback(() => {
    fetchPageAdmins(page.id, token)
      .then((d) => {
        setData(d);
        setLoadFailed(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadFailed(true);
      });
  }, [page.id, token]);
  useEffect(load, [load]);

  const add = async (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const person = await addPageAdmin(page.id, name, token);
      setUsername('');
      setStatus(t('pages.admins.added', { name: person.username }));
      load();
    } catch (err) {
      setError(serverErrorText(err, 'pages.admins.failed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    const leaving = removing.id === userId;
    setError('');
    setStatus('');
    try {
      await removePageAdmin(page.id, removing.id, token);
      setRemoving(null);
      if (leaving) {
        onLeft();
        return;
      }
      setStatus(t('pages.admins.removed', { name: removing.username }));
      load();
    } catch (err) {
      setRemoving(null);
      setError(serverErrorText(err, 'pages.admins.failed'));
    }
  };

  const full = data && data.admins.length >= MAX_ADMINS;
  return (
    <section aria-labelledby="page-admins-heading" className="page-admins">
      <h2 id="page-admins-heading" className="section-heading">{t('pages.admins.title')}</h2>
      <p className="form-hint">{t(page.is_owner ? 'pages.admins.explainOwner' : 'pages.admins.explainAdmin')}</p>
      {loadFailed && <FeedErrorState message={t('pages.admins.loadFailed')} onRetry={load} />}
      {!data && !loadFailed && <p className="screen-status" role="status">{t('common.loading')}</p>}
      {data && (
        <ul className="card-list">
          <li className="card-row group-member-row">
            <Avatar src={resolveImageUrl(data.owner.avatar_url)} initials={initials(data.owner.username)} size={36} alt="" />
            <span className="card-row-body">
              {data.owner.id === userId ? t('groups.you') : data.owner.username}
              <span className="group-admin-badge">{t('pages.admins.owner')}</span>
            </span>
          </li>
          {data.admins.map((a) => (
            <li key={a.id} className="card-row group-member-row">
              <Avatar src={resolveImageUrl(a.avatar_url)} initials={initials(a.username)} size={36} alt="" />
              <span className="card-row-body">
                {a.id === userId ? t('groups.you') : a.username}
                <span className="group-admin-badge">{t('pages.admins.admin')}</span>
              </span>
              {(page.is_owner || a.id === userId) && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRemoving(a)}
                  aria-label={a.id === userId ? undefined : t('pages.admins.removeName', { name: a.username })}>
                  {a.id === userId ? t('pages.admins.leave') : t('pages.admins.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {page.is_owner && data && (
        <form className="page-admins-form" onSubmit={add}>
          <label className="feed-visually-hidden" htmlFor="page-admin-input">{t('pages.admins.addLabel')}</label>
          <input id="page-admin-input" type="text" className="form-input" dir="auto" autoComplete="off" value={username} maxLength={50}
            onChange={(e) => setUsername(e.target.value)} placeholder={t('pages.admins.addPlaceholder')} disabled={busy || full} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || full || !username.trim()}>{t('pages.admins.add')}</button>
        </form>
      )}
      {full && page.is_owner && <p className="form-hint">{t('pages.admins.full', { max: MAX_ADMINS })}</p>}
      <p className="page-admins-status" role="status">{status}</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title={removing?.id === userId ? t('pages.admins.leaveTitle', { page: page.name }) : t('pages.admins.removeTitle', { name: removing?.username, page: page.name })}
        description={removing?.id === userId ? t('pages.admins.leaveText') : t('pages.admins.removeText')}
        confirmLabel={removing?.id === userId ? t('pages.admins.leave') : t('pages.admins.remove')}
        danger
      />
    </section>
  );
}

export default PageAdminsSection;
