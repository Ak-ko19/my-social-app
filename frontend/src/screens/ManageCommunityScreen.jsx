import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import './GroupsScreen.css';

// B13: /groups/:id/manage -- admins only (the API enforces it; this screen
// shows "admins only" otherwise). Edit details, handle join requests,
// manage members and roles.
function ManageCommunityScreen() {
  const navigate = useNavigate();
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
      setError('Could not load the group');
    }
  }, [id, token]);

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
        if (!cancelled) setError('Could not load the group');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  const act = (promise) => {
    setActionError('');
    setSaved(false);
    return promise.then(loadAll).catch((err) => {
      console.error(err);
      setActionError(err.response?.data || 'That action failed. Please try again.');
    });
  };

  if (error) return <FeedErrorState message={error} onRetry={loadAll} />;
  if (!group || !form) return <p className="screen-status" role="status">Loading…</p>;
  if (!group.is_admin) {
    return (
      <div className="screen-enter">
        <header className="screen-header">
          <IconButton icon={ChevronLeft} aria-label="Back to the group" onClick={() => navigate(`/groups/${id}`)} />
          <h1 className="screen-header-title">Manage group</h1>
        </header>
        <p className="screen-status">Only group admins can manage this group.</p>
      </div>
    );
  }

  const saveDetails = (e) => {
    e.preventDefault();
    act(updateCommunity(id, form, token)).then(() => setSaved(true));
  };

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to the group" onClick={() => navigate(`/groups/${id}`)} />
        <h1 className="screen-header-title">Manage group</h1>
      </header>
      <div className="screen-body">
        {actionError && <p className="form-error" role="alert">{actionError}</p>}

        <h2 className="section-heading">Details</h2>
        <form className="form-stack" onSubmit={saveDetails}>
          <label className="form-field">
            <span className="form-label">Name</span>
            <input className="form-input" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="form-field">
            <span className="form-label">Description</span>
            <textarea className="form-input" rows="3" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <fieldset className="audience-picker">
            <legend className="form-label">Privacy</legend>
            {['public', 'private'].map((p) => (
              <label key={p} className={form.privacy === p ? 'audience-option is-selected' : 'audience-option'}>
                <input type="radio" name="privacy" value={p} checked={form.privacy === p} onChange={() => setForm({ ...form, privacy: p })} />
                {p === 'public' ? <Globe size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />} {p === 'public' ? 'Public' : 'Private'}
              </label>
            ))}
          </fieldset>
          {group.privacy === 'private' && form.privacy === 'public' && requests.length > 0 && (
            <p className="group-privacy-hint">Making the group public will also admit the {requests.length} pending request(s).</p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={!form.name.trim()}>Save changes</button>
          {saved && <p className="form-success" role="status">Saved.</p>}
        </form>

        <h2 className="section-heading">Join requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className="screen-status">No pending requests.</p>
        ) : (
          <ul className="card-list">
            {requests.map((r) => (
              <li key={r.id} className="card-row group-member-row">
                <Avatar src={resolveImageUrl(r.avatar_url)} initials={r.username.slice(0, 2).toUpperCase()} size={36} alt="" />
                <span className="card-row-body">{r.username}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => act(approveJoinRequest(id, r.id, token))}>Approve</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(removeCommunityMember(id, r.id, token))} aria-label={`Deny ${r.username}`}>Deny</button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="section-heading">Members ({members.length})</h2>
        <ul className="card-list">
          {members.map((m) => (
            <li key={m.id} className="card-row group-member-row">
              <Avatar src={resolveImageUrl(m.avatar_url)} initials={m.username.slice(0, 2).toUpperCase()} size={36} alt="" />
              <span className="card-row-body">
                {m.id === userId ? 'You' : m.username}
                {m.role === 'admin' && <span className="group-admin-badge">Admin</span>}
              </span>
              {m.id !== userId && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(setCommunityRole(id, m.id, m.role === 'admin' ? 'member' : 'admin', token))}>
                    {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(removeCommunityMember(id, m.id, token))} aria-label={`Remove ${m.username}`}>
                    Remove
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
