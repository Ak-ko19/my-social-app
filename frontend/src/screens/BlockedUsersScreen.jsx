import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fetchBlockedUsers, unblockUser } from '../services/blockService';
import { resolveImageUrl } from '../api';
import FeedErrorState from '../components/feed/FeedErrorState';
import './BlockedUsersScreen.css';
import '../components/feed/Feed.css';

function BlockedUsersScreen() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unblockingId, setUnblockingId] = useState(null);
  const [actionError, setActionError] = useState('');

  // No synchronous setState in the effect body itself (loading/error already
  // start at the correct "about to load" defaults) -- same reasoning as
  // useFeed's fetchInitial: every state update happens inside the
  // .then()/.catch() callbacks, after the effect has already returned.
  const load = useCallback(() => {
    fetchBlockedUsers(token)
      .then((data) => setBlockedUsers(data.blockedUsers))
      .catch((err) => {
        console.error(err);
        setError('Failed to load blocked users');
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  // Event handler, not an effect, so resetting to the loading state
  // synchronously here is fine.
  const retry = () => {
    setError('');
    setLoading(true);
    load();
  };

  const handleUnblock = (userId) => {
    setUnblockingId(userId);
    setActionError('');
    unblockUser(userId, token)
      .then(() => setBlockedUsers((current) => current.filter((u) => u.id !== userId)))
      .catch((err) => {
        console.error(err);
        setActionError('Failed to unblock user. Please try again.');
      })
      .finally(() => setUnblockingId(null));
  };

  return (
    <div className="screen-enter">
      <header className="blocked-users-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Settings" onClick={() => navigate('/settings')} />
        <h1 className="blocked-users-header-title">Blocked Users</h1>
      </header>

      {loading && <p className="blocked-users-status">Loading…</p>}
      {!loading && error && <FeedErrorState message={error} onRetry={retry} />}
      {actionError && <p className="blocked-users-status" role="alert">{actionError}</p>}
      {!loading && !error && blockedUsers.length === 0 && (
        <p className="blocked-users-status">You haven't blocked anyone.</p>
      )}

      <ul className="blocked-users-list">
        {blockedUsers.map((user) => (
          <li key={user.id} className="blocked-users-row">
            <Avatar size={40} src={resolveImageUrl(user.avatar_url)} initials={(user.username || '?').slice(0, 2).toUpperCase()} alt="" />
            <span className="blocked-users-name">{user.username}</span>
            <button
              type="button"
              className="blocked-users-unblock-btn"
              onClick={() => handleUnblock(user.id)}
              disabled={unblockingId === user.id}
            >
              {unblockingId === user.id ? 'Unblocking…' : 'Unblock'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default BlockedUsersScreen;
