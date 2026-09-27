import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Globe, Lock, Plus, UsersRound } from 'lucide-react';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import FeedErrorState from '../components/feed/FeedErrorState';
import { fetchCommunities, joinCommunity } from '../services/communityService';
import './GroupsScreen.css';

function GroupRow({ group, token, onJoined }) {
  const [busy, setBusy] = useState(false);
  const status = group.my_status;
  const join = () => {
    setBusy(true);
    joinCommunity(group.id, token)
      .then(onJoined)
      .catch((err) => console.error(err))
      .finally(() => setBusy(false));
  };
  return (
    <li className="group-row">
      <Link to={`/groups/${group.id}`} className="group-row-link">
        <span className="group-row-icon" aria-hidden="true">
          <UsersRound size={22} />
        </span>
        <span className="group-row-text">
          <span className="group-row-name">{group.name}</span>
          <span className="group-row-meta">
            {group.privacy === 'private' ? <Lock size={12} aria-hidden="true" /> : <Globe size={12} aria-hidden="true" />}
            {group.privacy === 'private' ? ' Private' : ' Public'} · {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
            {status === 'pending' && ' · Requested'}
            {group.my_role === 'admin' && status === 'member' && ' · Admin'}
          </span>
        </span>
      </Link>
      {!status && (
        <button type="button" className="btn btn-primary btn-sm" onClick={join} disabled={busy} aria-label={`${group.privacy === 'private' ? 'Request to join' : 'Join'} ${group.name}`}>
          {group.privacy === 'private' ? 'Request' : 'Join'}
        </button>
      )}
    </li>
  );
}

// B13: /groups -- your groups (incl. pending requests) + groups to discover,
// with name search and a Create button.
function GroupsScreen() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Debounced so typing in the search box doesn't fire a request per key.
    const t = setTimeout(() => {
      fetchCommunities(token, query.trim())
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError('');
          }
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setError('Could not load groups');
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, query, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="screen-enter">
      <header className="screen-header">
        <IconButton icon={ChevronLeft} aria-label="Back to Menu" onClick={() => navigate('/menu')} />
        <h1 className="screen-header-title">Groups</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/groups/new')}>
          <Plus size={14} aria-hidden="true" /> Create
        </button>
      </header>
      <div className="screen-body">
        <label className="feed-visually-hidden" htmlFor="groups-search">Search groups</label>
        <input id="groups-search" type="search" className="form-input" placeholder="Search groups" value={query} onChange={(e) => setQuery(e.target.value)} />

        {error && <FeedErrorState message={error} onRetry={reload} />}
        {!data && !error && <p className="screen-status" role="status">Loading groups…</p>}
        {data && (
          <>
            <h2 className="section-heading">Your groups</h2>
            {data.mine.length === 0 ? (
              <p className="screen-status">You haven't joined any groups yet.</p>
            ) : (
              <ul className="group-list">
                {data.mine.map((g) => <GroupRow key={g.id} group={g} token={token} onJoined={reload} />)}
              </ul>
            )}
            <h2 className="section-heading">Discover</h2>
            {data.discover.length === 0 ? (
              <p className="screen-status">{query ? 'No groups match that search.' : 'No other groups yet. Create the first one!'}</p>
            ) : (
              <ul className="group-list">
                {data.discover.map((g) => <GroupRow key={g.id} group={g} token={token} onJoined={reload} />)}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default GroupsScreen;
