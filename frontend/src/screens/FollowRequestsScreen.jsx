import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton, Avatar } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fetchFollowRequests, approveFollowRequest, denyFollowRequest } from '../services/postService';
import { resolveImageUrl } from '../api';
import './FollowRequestsScreen.css';

function FollowRequestsScreen() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState(null);

  const load = useCallback(() => {
    fetchFollowRequests(token)
      .then(setRequests)
      .catch((err) => {
        console.error(err);
        setError('Failed to load follow requests');
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const handleApprove = (userId) => {
    setActioningId(userId);
    approveFollowRequest(userId, token)
      .then(() => setRequests((current) => current.filter((r) => r.id !== userId)))
      .catch((err) => console.error(err))
      .finally(() => setActioningId(null));
  };

  const handleDeny = (userId) => {
    setActioningId(userId);
    denyFollowRequest(userId, token)
      .then(() => setRequests((current) => current.filter((r) => r.id !== userId)))
      .catch((err) => console.error(err))
      .finally(() => setActioningId(null));
  };

  return (
    <div className="screen-enter">
      <header className="follow-requests-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Settings" onClick={() => navigate('/settings')} />
        <h1 className="follow-requests-header-title">Follow Requests</h1>
      </header>

      {loading && <p className="follow-requests-status">Loading…</p>}
      {!loading && error && <p className="follow-requests-status">{error}</p>}
      {!loading && !error && requests.length === 0 && (
        <p className="follow-requests-status">No pending follow requests.</p>
      )}

      <ul className="follow-requests-list">
        {requests.map((user) => (
          <li key={user.id} className="follow-requests-row">
            <Avatar size={40} src={resolveImageUrl(user.avatar_url)} initials={(user.username || '?').slice(0, 2).toUpperCase()} alt="" />
            <span className="follow-requests-name">{user.username}</span>
            <button
              type="button"
              className="follow-requests-btn follow-requests-btn-deny"
              onClick={() => handleDeny(user.id)}
              disabled={actioningId === user.id}
            >
              Deny
            </button>
            <button
              type="button"
              className="follow-requests-btn follow-requests-btn-approve"
              onClick={() => handleApprove(user.id)}
              disabled={actioningId === user.id}
            >
              Approve
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FollowRequestsScreen;
