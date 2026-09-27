import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Globe, Lock } from 'lucide-react';
import { Avatar, IconButton } from '../components/ui';
import { resolveImageUrl } from '../api';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import {
  fetchCommunity,
  updateCommunity,
  fetchJoinRequests,
  approveJoinRequest,
  fetchCommunityMembers,
  removeCommunityMember,
  setCommunityRole
} from '../services/communityService';
import { serverErrorText } from '../utils/serverError';
import './GroupsScreen.css';

// B13: /groups/:id/manage -- admins only (the API enforces it; this screen
// shows "admins only" otherwise). Edit details, handle join requests,
// manage members and roles.
function ManageCommunityScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams();
  const { token, userId } = useAuth();
  const [group, setGroup] = useState(null);
  const [form, setForm] = useState(null);
  const [requests, setRequests] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saved, setSaved] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const g = await fetchCommunity(id, token);
      setGroup(g);
      setForm({ name: g.name, description: g.description || '', privacy: g.privacy });
      if (!g.is_admin) return;
      const [r, m] = await Promise.all([fetchJoinRequests(id, token), fetchCommunityMembers(id, token)]);
      setRequests(r);
      setMembers(m);
      setError('');
    } catch (err) {
      console.error(err);
      setError(t('groups.manageLoadFailed'));
    }
  }, [id, token, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await fetchCommunity(id, token);
        if (cancelled) return;
        setGroup(g);
        setForm({ name: g.name, description: g.description || '', privacy: g.privacy });
        if (!g.is_admin) return;
        const [r, m] = await Promise.all([fetchJoinRequests(id, token), fetchCommunityMembers(id, token)]);
        if (!cancelled) {
          setRequests(r);
          setMembers(m);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(t('groups.manageLoadFailed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token, t]);

  const act = (promise) => {
    setActionError('');
    setSaved(false);
    return promise.then(loadAll).catch((err) => {
      console.error(err);
      setActionError(serverErrorText(err, 'groups.actionFailed'));
    });
  };

  if (error) return <FeedErrorState message={error} onRetry={loadAll} />;
  if (!group || !form) return <p className="screen-status" role="status">{t('common.loading')}</p>;
  if (!group.is_admin) {
    return (
      <div className="screen-enter">
        <header className="screen-header">
          <IconButton icon={ChevronLeft} aria-label={t('groups.backToGroup')} onClick={() => navigate(`/groups/${id}`)} />
          <h1 className="screen-header-title">{t('groups.manage')}</h1>
        </header>
        <p className="screen-status">{t('groups.adminsOnly')}</p>
      </div>
    );
  }

  const saveDetails = (e) => {
    e.preventDefault();
    act(updateCommunity(id, form, token)).then(() => setSaved(true));
  };
  const initials = (name) => (name || '?').slice(0, 2).toUpperCase();

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label={t('groups.backToGroup')} onClick={() => navigate(`/groups/${id}`)} />
        <h1 className="screen-header-title">{t('groups.manage')}</h1>
      </header>
      <div className="screen-body">
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <h2 className="section-heading">{t('groups.details')}</h2>
        <form className="form-stack" onSubmit={saveDetails}>
          <label className="form-field">
            <span className="form-label">{t('groups.name')}</span>
            <input className="form-input" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="form-field">
            <span className="form-label">{t('groups.description')}</span>
            <textarea className="form-input" rows="3" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <fieldset className="audience-picker">
            <legend className="form-label">{t('groups.privacy')}</legend>
            {['public', 'private'].map((p) => (
              <label key={p} className={form.privacy === p ? 'audience-option is-selected' : 'audience-option'}>
                <input type="radio" name="privacy" value={p} checked={form.privacy === p} onChange={() => setForm({ ...form, privacy: p })} />
                {p === 'public' ? <Globe size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />} {p === 'public' ? t('groups.public') : t('groups.private')}
              </label>
            ))}
          </fieldset>
          {group.privacy === 'private' && form.privacy === 'public' && requests.length > 0 && (
            <p className="group-privacy-hint">{t('groups.admitHint', { count: requests.length })}</p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={!form.name.trim()}>{t('common.saveChanges')}</button>
          {saved && <p className="form-success" role="status">{t('common.saved')}</p>}
        </form>

        <h2 className="section-heading">{t('groups.requests', { count: requests.length })}</h2>
        {requests.length === 0 ? (
          <p className="screen-status">{t('groups.noRequests')}</p>
        ) : (
          <ul className="card-list">
            {requests.map((r) => (
              <li key={r.id} className="card-row group-member-row">
                <Avatar src={resolveImageUrl(r.avatar_url)} initials={initials(r.username)} size={36} alt="" />
                <span className="card-row-body">{r.username}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => act(approveJoinRequest(id, r.id, token))}>{t('groups.approve')}</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(removeCommunityMember(id, r.id, token))} aria-label={t('groups.denyName', { name: r.username })}>{t('groups.deny')}</button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="section-heading">{t('groups.members', { count: members.length })}</h2>
        <ul className="card-list">
          {members.map((m) => (
            <li key={m.id} className="card-row group-member-row">
              <Avatar src={resolveImageUrl(m.avatar_url)} initials={initials(m.username)} size={36} alt="" />
              <span className="card-row-body">
                {m.id === userId ? t('groups.you') : m.username}
                {m.role === 'admin' && <span className="group-admin-badge">{t('groups.admin')}</span>}
              </span>
              {m.id !== userId && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(setCommunityRole(id, m.id, m.role === 'admin' ? 'member' : 'admin', token))}>
                    {m.role === 'admin' ? t('groups.removeAdmin') : t('groups.makeAdmin')}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(removeCommunityMember(id, m.id, token))} aria-label={t('groups.removeName', { name: m.username })}>
                    {t('groups.remove')}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ManageCommunityScreen;
