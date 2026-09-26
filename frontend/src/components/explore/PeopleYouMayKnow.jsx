import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui';
import FollowButton from '../feed/FollowButton';
import { useFollowToggle } from '../../hooks/useFollowToggle';
import { fetchSuggestions } from '../../services/suggestionService';
import { resolveImageUrl } from '../../api';
import './Explore.css';

// Why this person is suggested, in plain words.
function reasonText(s) {
  if (s.reason === 'follows_you') return 'Follows you';
  if (s.reason === 'popular') return s.follower_count ? `Popular · ${s.follower_count} followers` : 'New to MySocialApp';
  const [first, second] = s.mutual_sample || [];
  const others = s.mutual_count - (s.mutual_sample?.length || 0);
  if (!first) return `${s.mutual_count} mutual`;
  if (second && others <= 0) return `Followed by ${first} and ${second}`;
  if (others > 0) return `Followed by ${first} and ${others + (second ? 1 : 0)} other${others + (second ? 1 : 0) === 1 ? '' : 's'}`;
  return `Followed by ${first}`;
}

function SuggestionCard({ s, token }) {
  const follow = useFollowToggle(s.id, false, token);
  return (
    <li className="pymk-card">
      <Link to={`/profile/${s.id}`} className="pymk-profile-link">
        <Avatar size={56} src={resolveImageUrl(s.avatar_url)} initials={(s.username || '?').slice(0, 2).toUpperCase()} alt="" />
        <span className="pymk-name">{s.username}</span>
      </Link>
      <span className="pymk-reason">{reasonText(s)}</span>
      <FollowButton follow={follow} />
    </li>
  );
}

// B8 "People you may know" -- a horizontal row of suggestion cards. Shown
// on Explore and on Search before a query. Hidden entirely when there's
// nothing to suggest or the request fails (it's a discovery aid, not
// primary content).
function PeopleYouMayKnow({ token }) {
  const [suggestions, setSuggestions] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetchSuggestions(token)
      .then((data) => {
        if (!cancelled) setSuggestions(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <section className="pymk" aria-label="People you may know">
      <h2 className="section-heading">People you may know</h2>
      <ul className="pymk-row">
        {suggestions.map((s) => (
          <SuggestionCard key={s.id} s={s} token={token} />
        ))}
      </ul>
    </section>
  );
}

export default PeopleYouMayKnow;
