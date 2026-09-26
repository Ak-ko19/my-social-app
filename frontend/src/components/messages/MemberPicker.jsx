import { useEffect, useMemo, useState } from 'react';
import Avatar from '../common/Avatar';
import { fetchMyFollowing } from '../../services/messageService';

// B10: pick people (from the accounts you follow) for a group. Native
// checkboxes so it's keyboard/screen-reader friendly for free; a filter box
// once the list is long. `excludeIds` hides people already in the group.
function MemberPicker({ userId, token, selectedIds, onChange, excludeIds = [] }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMyFollowing(userId, token)
      .then((data) => {
        if (!cancelled) setPeople(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setError('Could not load the people you follow');
          setPeople([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people || []).filter((p) => !q || p.username.toLowerCase().includes(q));
  }, [people, query]);

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  if (people === null) return <p className="screen-status" role="status">Loading people…</p>;
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (people.length === 0) {
    return <p className="screen-status">Follow people first — groups are made from the accounts you follow.</p>;
  }

  return (
    <div className="member-picker">
      <label className="feed-visually-hidden" htmlFor="member-picker-filter">
        Filter people
      </label>
      <input
        id="member-picker-filter"
        type="search"
        className="form-input"
        placeholder="Search people you follow"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="member-picker-list">
        {visible.map((p) => {
          const already = excludeIds.includes(p.id);
          return (
            <li key={p.id}>
              <label className={already ? 'member-picker-row is-disabled' : 'member-picker-row'}>
                <input
                  type="checkbox"
                  checked={already || selectedIds.includes(p.id)}
                  disabled={already}
                  onChange={() => toggle(p.id)}
                />
                <Avatar src={p.avatar_url} size={36} alt="" />
                <span className="member-picker-name">{p.username}</span>
                {already && <span className="member-picker-note">In group</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default MemberPicker;
